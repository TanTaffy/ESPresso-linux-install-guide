import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
} from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import {
  getTheme,
  getScheme,
  parseAppearance,
  defaultAppearance,
  validAppearance,
} from '../src/themes';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  Position,
  Project,
  TaskTemplate,
  Library,
  Catalog,
} from '../src/model';
import { createNativeClient } from './native-client';
import { openFolder } from './open-folder';
import { developerTools, openInEditor } from './developer-tools';

let window: BrowserWindow;
let currentPath: string | null = null;
let lastExport: string | null = null;
let exportParent: string | null = null;
let latest: Project | null = null;
let baseline: Project | null = null;
let pendingRecovery: Project | null = null;
let recoveryWriteError = '';
let dirty = false,
  closing = false;
const entry = path.resolve(__dirname, '../dist/index.html');
if (process.env.ESPRESSO_TEST_DATA)
  app.setPath('userData', process.env.ESPRESSO_TEST_DATA);
const core = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, 'core/espresso-core.exe')
    : path.resolve(__dirname, '../build/native/Release/espresso-core.exe');
const autosave = () =>
  path.join(app.getPath('userData'), 'recovery.espresso.json');
const native = createNativeClient(core);
const bundled = (name: string) =>
  app.isPackaged
    ? path.join(process.resourcesPath, name)
    : path.resolve(__dirname, '..', name);
const catalogPath = (kind: 'templates' | 'libraries') =>
  path.join(
    // Keep user-managed files outside AppData virtualization when the portable
    // app is launched from a packaged desktop application.
    process.env.ESPRESSO_TEST_DATA
      ? app.getPath('userData')
      : path.join(app.getPath('documents'), 'ESPresso'),
    kind === 'templates' ? 'Task templates' : 'Libraries',
  );
let catalogsReady: Promise<unknown>;
async function catalog<T>(
  kind: 'templates' | 'libraries',
  op = 'catalog-load',
  extra: object = {},
) {
  await catalogsReady;
  return native<Catalog<T>>({ op, kind, path: catalogPath(kind), ...extra });
}
async function newProject() {
  const r = await native({ op: 'new' });
  const libraries = await catalog<Library>('libraries');
  r.project.libraries = libraries.items;
  return { project: r.project, recoveryError: libraries.errors.join('\n') };
}

let draftChain: Promise<unknown> = Promise.resolve();
let pendingDraft: Project | null = null;
let draftRunning = false;
async function save(project: Project, saveAs = false) {
  let destination = currentPath;
  if (!destination || saveAs) {
    const answer = await dialog.showSaveDialog(window, {
      title: 'Save ESPresso layout',
      defaultPath: destination || `${project.name}.espresso.json`,
      filters: [{ name: 'ESPresso layout', extensions: ['espresso.json'] }],
    });
    if (answer.canceled || !answer.filePath) return null;
    destination = answer.filePath;
  }
  const result = await native<{ path: string }>({
    op: 'save',
    path: destination,
    project,
  });
  currentPath = result.path;
  dirty = false;
  latest = project;
  baseline = project;
  return result;
}
function register(name: string, fn: (...args: any[]) => unknown) {
  ipcMain.handle(name, (event, ...args) => {
    if (
      event.sender !== window.webContents ||
      event.senderFrame?.url !== pathToFileURL(entry).href
    )
      throw new Error('Untrusted IPC sender.');
    return fn(...args);
  });
}
app.whenReady().then(() => {
  const preferencesPath = path.join(app.getPath('userData'), 'appearance.json');
  let appearance = defaultAppearance;
  try {
    appearance = parseAppearance(
      JSON.parse(readFileSync(preferencesPath, 'utf8')),
    );
  } catch {
    /* First launch or unreadable preferences use Latte. */
  }
  const theme = getTheme(appearance);
  nativeTheme.themeSource = getScheme(theme);
  let themeWrites: Promise<void> = Promise.resolve();

  catalogsReady = Promise.all(
    (['templates', 'libraries'] as const).map((kind) =>
      native({
        op: 'catalog-seed',
        path: catalogPath(kind),
        source: path.join(
          bundled('defaults'),
          kind === 'templates' ? 'task-templates' : 'libraries',
        ),
      }),
    ),
  );
  window = new BrowserWindow({
    width: 1510,
    height: 980,
    minWidth: 1050,
    minHeight: 720,
    show: false,
    backgroundColor: theme.palette.background,
    title: 'ESPresso',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'branding/espresso-mark.png')
      : path.resolve(__dirname, '../public/brand/espresso-mark.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      additionalArguments: [
        `--espresso-appearance=${encodeURIComponent(JSON.stringify(appearance))}`,
      ],
    },
  });
  window.removeMenu();
  register('set-appearance', (value: unknown) => {
    if (!validAppearance(value)) throw new Error('Invalid theme settings.');
    const preferences = {
      selected: value.selected,
      customThemes: value.customThemes.map((t) => ({
        id: t.id,
        name: t.name.trim(),
        palette: t.palette,
      })),
    };
    themeWrites = themeWrites
      .catch(() => {})
      .then(async () => {
        await mkdir(app.getPath('userData'), { recursive: true });
        await writeFile(
          preferencesPath,
          JSON.stringify(preferences) + '\n',
          'utf8',
        );
        const selected = getTheme(preferences);
        nativeTheme.themeSource = getScheme(selected);
        window.setBackgroundColor(selected.palette.background);
      });
    return themeWrites;
  });
  register('boot', async () => {
    const r = await newProject();
    pendingRecovery = null;
    recoveryWriteError = '';
    if (existsSync(autosave())) {
      try {
        pendingRecovery = (await native({ op: 'load', path: autosave() }))
          .project;
      } catch (error) {
        const backup = path.join(
          app.getPath('userData'),
          `recovery-unreadable-${Date.now()}.espresso.json`,
        );
        let detail: string;
        try {
          await rename(autosave(), backup);
          detail = `The original file is kept at ${backup}.`;
        } catch {
          recoveryWriteError = `Recovery copies are paused to preserve the unreadable file at ${autosave()}.`;
          detail = recoveryWriteError;
        }
        r.recoveryError = [
          r.recoveryError,
          `Could not recover the previous session: ${error}. ${detail}`,
        ]
          .filter(Boolean)
          .join('\n');
      }
    }
    currentPath = null;
    latest = r.project;
    baseline = r.project;
    return {
      ...r,
      restored: false,
      recovery: pendingRecovery ? { name: pendingRecovery.name } : undefined,
    };
  });
  register('resolve-recovery', async (recover: boolean) => {
    if (typeof recover !== 'boolean')
      throw new Error('Invalid recovery choice.');
    if (!pendingRecovery) throw new Error('No previous session is available.');
    if (!recover) {
      await rm(autosave(), { force: true });
      pendingRecovery = null;
      return null;
    }
    const project = pendingRecovery;
    pendingRecovery = null;
    currentPath = null;
    latest = project;
    baseline = project;
    dirty = true;
    return project;
  });
  register('open-issues', () =>
    shell.openExternal('https://github.com/Trovix/ESPresso/issues'),
  );
  register('import-config', async (project: Project) => {
    const answer = await dialog.showOpenDialog(window, {
      title: 'Import config file',
      properties: ['openFile'],
      filters: [{ name: 'C++ config file', extensions: ['h', 'hpp'] }],
    });
    if (answer.canceled || !answer.filePaths[0]) return null;
    const imported = structuredClone(project);
    imported.configFile = {
      path: `config/${path.basename(answer.filePaths[0])}`,
      content: '',
    };
    if (imported.extraFiles)
      delete imported.extraFiles[`main/${imported.configFile.path}`];
    return (
      await native({
        op: 'import-config',
        project: imported,
        path: answer.filePaths[0],
      })
    ).project;
  });
  register('preview', (project: Project) => native({ op: 'preview', project }));
  register('templates', () => catalog<TaskTemplate>('templates'));
  register('save-template', (entry: TaskTemplate) =>
    catalog<TaskTemplate>('templates', 'catalog-save', { entry }),
  );
  register('delete-template', (id: string) =>
    catalog<TaskTemplate>('templates', 'catalog-delete', { id }),
  );
  register('libraries-catalog', () => catalog<Library>('libraries'));
  register('save-library-default', (entry: Library) =>
    catalog<Library>('libraries', 'catalog-save', { entry }),
  );
  for (const kind of ['templates', 'libraries'] as const)
    register(`reveal-${kind}`, async () => {
      await catalogsReady;
      await openFolder(catalogPath(kind));
    });
  register(
    'instantiate-template',
    async (project: Project, template: TaskTemplate, position: Position) => {
      const r = await native({
        op: 'instantiate-template',
        project,
        template,
        position,
      });
      return r.project;
    },
  );
  register('check-library', async (project: Project) => {
    await native({ op: 'check-library', project });
    return true;
  });
  register('draft', (project: Project, isDirty: boolean) => {
    latest = project;
    dirty = isDirty;
    if (pendingRecovery)
      throw new Error('Choose whether to recover the previous session first.');
    if (recoveryWriteError) throw new Error(recoveryWriteError);
    pendingDraft = project;
    if (!draftRunning) {
      draftRunning = true;
      draftChain = (async () => {
        while (pendingDraft) {
          const draft = pendingDraft;
          pendingDraft = null;
          await native({ op: 'save', project: draft, path: autosave() });
        }
      })().finally(() => {
        draftRunning = false;
      });
    }
    return draftChain.then(() => {});
  });
  register('save', save);
  register('import-project', async (mode: 'file' | 'folder' = 'file') => {
    if (mode !== 'file' && mode !== 'folder')
      throw new Error('Choose a project file or folder.');
    const answer = await dialog.showOpenDialog(window, {
      title:
        mode === 'folder'
          ? 'Choose exported ESPresso project folder'
          : 'Choose ESPresso project file',
      properties: [mode === 'folder' ? 'openDirectory' : 'openFile'],
      ...(mode === 'file'
        ? {
            filters: [
              {
                name: 'ESPresso project files',
                extensions: ['project.json', 'layout.json', 'txt'],
              },
            ],
          }
        : {}),
    });
    if (answer.canceled || !answer.filePaths[0]) return null;
    const result = await native(
      { op: 'import-project', path: answer.filePaths[0] },
      120000,
    );
    currentPath = null;
    latest = result.project;
    baseline = result.project;
    dirty = true;
    return { project: result.project };
  });
  register('local-library', async () => {
    const answer = await dialog.showOpenDialog(window, {
      title: 'Choose library source folder',
      properties: ['openDirectory'],
    });
    if (answer.canceled || !answer.filePaths[0]) return null;
    const result = await native({
      op: 'local-library',
      path: answer.filePaths[0],
    });
    return result.library;
  });
  register('open', async () => {
    const answer = await dialog.showOpenDialog(window, {
      title: 'Open ESPresso layout',
      properties: ['openFile'],
      filters: [
        {
          name: 'ESPresso layout',
          extensions: ['espresso.json', 'layout.json'],
        },
      ],
    });
    if (answer.canceled) return null;
    const result = await native({ op: 'load', path: answer.filePaths[0] });
    currentPath = answer.filePaths[0];
    latest = result.project;
    baseline = result.project;
    dirty = false;
    return { project: result.project, path: currentPath };
  });
  register('export', async (project: Project) => {
    const answer = exportParent
      ? { canceled: false, filePaths: [exportParent] }
      : await dialog.showOpenDialog(window, {
          title: `Choose parent folder for ${project.name}`,
          properties: ['openDirectory', 'createDirectory'],
        });
    if (answer.canceled) return null;
    const result = await native(
      {
        op: 'export',
        project,
        path: answer.filePaths[0],
      },
      120000,
    );
    lastExport = result.path;
    exportParent = null;
    return result;
  });
  register('choose-export-folder', async (name: string) => {
    if (typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name))
      throw new Error('Choose a valid project name first.');
    const answer = await dialog.showOpenDialog(window, {
      title: `Choose parent folder — ESPresso creates a new ${name} folder inside`,
      defaultPath: lastExport ? path.dirname(lastExport) : undefined,
      properties: ['openDirectory', 'createDirectory'],
    });
    if (answer.canceled || !answer.filePaths[0]) return null;
    exportParent = answer.filePaths[0];
    return exportParent;
  });
  register('developer-tools', developerTools);
  register('open-export-in-editor', async () => {
    if (!lastExport) throw new Error('Export your project first.');
    await openInEditor(lastExport);
  });
  register('example', async () => {
    const r = await native({
      op: 'load',
      path: path.join(bundled('examples'), 'pressure-node.espresso.json'),
    });
    return r.project;
  });
  register('empty', async () => {
    const r = await newProject();
    return r.project;
  });
  register('new-document', (project: Project) => {
    exportParent = null;
    currentPath = null;
    dirty = false;
    latest = project;
    baseline = project;
  });
  register('reveal-export', async () => {
    if (lastExport) {
      await openFolder(lastExport);
    }
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== pathToFileURL(entry).href) event.preventDefault();
  });
  window.webContents.on('will-prevent-unload', () => {
    // A cancelled library-form close must leave normal save-on-close checks active.
    closing = false;
  });
  window.on('close', (event) => {
    if (closing) return;
    if (dirty && latest) {
      event.preventDefault();
      void (async () => {
        const answer = await dialog.showMessageBox(window, {
          type: 'question',
          title: 'Unsaved layout',
          message: 'Save your layout before closing?',
          detail: 'A recovery copy is also kept on this computer.',
          buttons: ['Save layout', 'Discard changes', 'Cancel'],
          defaultId: 0,
          cancelId: 2,
        });
        if (answer.response === 2) return;
        try {
          if (answer.response === 0 && !(await save(latest!))) return;
          await draftChain;
          if (answer.response === 1 && baseline && !recoveryWriteError)
            await native({ op: 'save', project: baseline, path: autosave() });
          closing = true;
          window.close();
        } catch (e) {
          await dialog.showMessageBox(window, {
            type: 'error',
            message: 'Could not save layout',
            detail: String(e),
          });
        }
      })();
    }
  });
  window.once('ready-to-show', () => {
    if (!process.env.ESPRESSO_TEST_HEADLESS) window.show();
  });
  void window.loadFile(entry);
});
app.on('window-all-closed', () => app.quit());
