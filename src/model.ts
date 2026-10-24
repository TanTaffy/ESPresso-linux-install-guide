export type Position = { x: number; y: number };
export type Step = {
  id: string;
  kind: 'placeholder' | 'read' | 'write';
  name: string;
  note: string;
  structId?: string;
  localName?: string;
  action?: 'msm_can_init' | 'msm_can_send';
};
export type Task = {
  id: string;
  kind: 'task';
  name: string;
  symbol: string;
  position: Position;
  periodMs: number;
  priority: number;
  stackBytes: number;
  core: 'any' | '0' | '1';
  preset?: 'msm_can';
  libraryIds?: string[];
  setup: Step[];
  loop: Step[];
};
export type Field = {
  id: string;
  name: string;
  type: string;
  initialValue: string;
};
export type SharedStruct = {
  id: string;
  kind: 'struct';
  name: string;
  symbol: string;
  typeName: string;
  position: Position;
  fields: Field[];
};
export type LayoutNode = Task | SharedStruct;
export type Project = {
  version: 1;
  name: string;
  target: 'esp32s3' | 'esp32' | 'esp32c3';
  nodes: LayoutNode[];
  libraries?: Library[];
  code?: Record<string, string>;
};
export type Library = {
  id: string;
  name: string;
  source: 'local' | 'github';
  repository?: string;
  version: string;
  headers: string[];
  dependencies: string[];
  files?: Record<string, string>;
};
export type Diagnostic = {
  severity: 'error' | 'warning';
  message: string;
  nodeId: string;
};
export type Preview = {
  valid: boolean;
  diagnostics: Diagnostic[];
  files: Record<string, string>;
  stepStates?: Record<string, string>;
  stepCode?: Record<string, string>;
};
export type Boot = {
  project: Project;
  recoveryError?: string;
  restored: boolean;
};
export type SaveResult = { path: string } | null;
export type ExportResult = {
  path: string;
  fileCount: number;
  msmCanVersion?: string;
} | null;
export type Phase = 'setup' | 'loop';
export interface DesktopApi {
  boot(): Promise<Boot>;
  preview(project: Project): Promise<Preview>;
  draft(project: Project, dirty: boolean): Promise<void>;
  save(project: Project, saveAs?: boolean): Promise<SaveResult>;
  open(): Promise<{ project: Project; path: string } | null>;
  importProject(): Promise<{ project: Project } | null>;
  localLibrary(): Promise<Omit<Library, 'id'> | null>;
  checkLibrary(project: Project): Promise<boolean>;
  export(project: Project): Promise<ExportResult>;
  example(): Promise<Project>;
  empty(): Promise<Project>;
  canPreset(
    project: Project,
    position: Position,
  ): Promise<{ task: Task; libraries: Library[] }>;
  newDocument(project: Project): Promise<void>;
  revealExport(): Promise<void>;
}
declare global {
  interface Window {
    espresso: DesktopApi;
  }
}
export const fieldTypes = [
  'uint8_t',
  'uint16_t',
  'uint32_t',
  'uint64_t',
  'int8_t',
  'int16_t',
  'int32_t',
  'int64_t',
  'float',
  'double',
  'bool',
];
export const uid = () => crypto.randomUUID();
