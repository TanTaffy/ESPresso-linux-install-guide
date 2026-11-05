import { contextBridge, ipcRenderer } from 'electron';
import { parseAppearance, defaultAppearance } from '../src/themes';
const initialAppearance = (() => {
  try {
    return parseAppearance(
      JSON.parse(
        decodeURIComponent(
          process.argv
            .find((arg) => arg.startsWith('--espresso-appearance='))
            ?.slice('--espresso-appearance='.length) ?? '',
        ),
      ),
    );
  } catch {
    return defaultAppearance;
  }
})();
import type { DesktopApi } from '../src/model';
const api: DesktopApi = {
  initialAppearance,
  setAppearance: (appearance) =>
    ipcRenderer.invoke('set-appearance', appearance),
  importConfig: (project) => ipcRenderer.invoke('import-config', project),
  boot: () => ipcRenderer.invoke('boot'),
  resolveRecovery: (recover) => ipcRenderer.invoke('resolve-recovery', recover),
  openIssues: () => ipcRenderer.invoke('open-issues'),
  checkUpdates: () => ipcRenderer.invoke('check-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  preview: (project) => ipcRenderer.invoke('preview', project),
  draft: (project, dirty) => ipcRenderer.invoke('draft', project, dirty),
  save: (project, saveAs) => ipcRenderer.invoke('save', project, saveAs),
  open: () => ipcRenderer.invoke('open'),
  importProject: (mode) => ipcRenderer.invoke('import-project', mode),
  localLibrary: () => ipcRenderer.invoke('local-library'),
  checkLibrary: (project) => ipcRenderer.invoke('check-library', project),
  export: (project) => ipcRenderer.invoke('export', project),
  example: () => ipcRenderer.invoke('example'),
  empty: () => ipcRenderer.invoke('empty'),
  newDocument: (project) => ipcRenderer.invoke('new-document', project),
  revealExport: () => ipcRenderer.invoke('reveal-export'),
  chooseExportFolder: (name) =>
    ipcRenderer.invoke('choose-export-folder', name),
  developerTools: () => ipcRenderer.invoke('developer-tools'),
  openExportInEditor: () => ipcRenderer.invoke('open-export-in-editor'),
  templates: () => ipcRenderer.invoke('templates'),
  saveTemplate: (template) => ipcRenderer.invoke('save-template', template),
  deleteTemplate: (id) => ipcRenderer.invoke('delete-template', id),
  revealTemplates: () => ipcRenderer.invoke('reveal-templates'),
  librariesCatalog: () => ipcRenderer.invoke('libraries-catalog'),
  saveLibraryDefault: (library) =>
    ipcRenderer.invoke('save-library-default', library),
  revealLibraries: () => ipcRenderer.invoke('reveal-libraries'),
  instantiateTemplate: (project, template, position) =>
    ipcRenderer.invoke('instantiate-template', project, template, position),
};
contextBridge.exposeInMainWorld('espresso', api);
