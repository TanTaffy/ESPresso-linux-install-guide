import { app, BrowserWindow, dialog, ipcMain, nativeTheme } from 'electron';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
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

let window: BrowserWindow;
let currentPath: string | null = null;
let lastExport: string | null = null;
let latest: Project | null = null;
let baseline: Project | null = null;
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
    currentPath = null;
    latest = r.project;
    baseline = r.project;
    return { ...r, restored: false };
  });
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
  register('import-project', async () => {
    const answer = await dialog.showOpenDialog(window, {
      title: 'Import ESPresso project',
      properties: ['openFile'],
      filters: [{ name: 'ESPresso project', extensions: ['project.json'] }],
    });
    if (answer.canceled || !answer.filePaths[0]) return null;
    const result = await native(
      { op: 'import-project', path: answer.filePaths[0] },
      120000,
    );
    currentPath = null;
    latest = result.project;
    baseline = result.project;
    dirty = false;
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
    const answer = await dialog.showOpenDialog(window, {
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
    return result;
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
          if (answer.response === 1 && baseline)
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
