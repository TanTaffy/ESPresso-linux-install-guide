import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Position, Project } from '../src/model';
import { createNativeClient } from './native-client';

let window: BrowserWindow;
let currentPath: string | null = null;
let lastExport: string | null = null;
let latest: Project | null = null;
let baseline: Project | null = null;
let dirty = false,
  closing = false;
const entry = path.resolve(__dirname, '../dist/index.html');
if (process.env.TASKFLOW_TEST_DATA)
  app.setPath('userData', process.env.TASKFLOW_TEST_DATA);
const core = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, 'core/taskflow-core.exe')
    : path.resolve(__dirname, '../build/native/Release/taskflow-core.exe');
const autosave = () =>
  path.join(app.getPath('userData'), 'recovery.taskflow.json');
const native = createNativeClient(core);
let draftChain: Promise<unknown> = Promise.resolve();
let pendingDraft: Project | null = null;
let draftRunning = false;
async function save(project: Project, saveAs = false) {
  let destination = currentPath;
  if (!destination || saveAs) {
    const answer = await dialog.showSaveDialog(window, {
      title: 'Save ESPresso layout',
      defaultPath: destination || `${project.name}.taskflow.json`,
      filters: [{ name: 'ESPresso layout', extensions: ['taskflow.json'] }],
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
  window = new BrowserWindow({
    width: 1510,
    height: 980,
    minWidth: 1050,
    minHeight: 720,
    show: false,
    backgroundColor: '#f8f3eb',
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
    },
  });
  window.removeMenu();
  register('boot', async () => {
    const r = await native({ op: 'new' });
    currentPath = null;
    latest = r.project;
    baseline = r.project;
    return { project: r.project, restored: false };
  });
  register('preview', (project: Project) => native({ op: 'preview', project }));
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
  register('open', async () => {
    const answer = await dialog.showOpenDialog(window, {
      title: 'Open ESPresso layout',
      properties: ['openFile'],
      filters: [{ name: 'ESPresso layout', extensions: ['json'] }],
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
    const r = await native({ op: 'example' });
    return r.project;
  });
  register('empty', async () => {
    const r = await native({ op: 'new' });
    return r.project;
  });
  register('can-preset', async (project: Project, position: Position) => {
    const r = await native({ op: 'can-preset', project, position });
    return r.task;
  });
  register('new-document', (project: Project) => {
    currentPath = null;
    dirty = false;
    latest = project;
    baseline = project;
  });
  register('reveal-export', async () => {
    if (lastExport) {
      const error = await shell.openPath(lastExport);
      if (error) throw new Error(error);
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
    if (!process.env.TASKFLOW_TEST_HEADLESS) window.show();
  });
  void window.loadFile(entry);
});
app.on('window-all-closed', () => app.quit());
