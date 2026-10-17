import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopApi } from '../src/model';
const api: DesktopApi = {
  boot: () => ipcRenderer.invoke('boot'),
  preview: (project) => ipcRenderer.invoke('preview', project),
  draft: (project, dirty) => ipcRenderer.invoke('draft', project, dirty),
  save: (project, saveAs) => ipcRenderer.invoke('save', project, saveAs),
  open: () => ipcRenderer.invoke('open'),
  export: (project) => ipcRenderer.invoke('export', project),
  example: () => ipcRenderer.invoke('example'),
  empty: () => ipcRenderer.invoke('empty'),
  canPreset: (project, position) =>
    ipcRenderer.invoke('can-preset', project, position),
  newDocument: (project) => ipcRenderer.invoke('new-document', project),
  revealExport: () => ipcRenderer.invoke('reveal-export'),
};
contextBridge.exposeInMainWorld('taskflow', api);
