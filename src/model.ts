import type { Appearance } from './themes';
export type Position = { x: number; y: number };
export type Step = {
  id: string;
  kind: 'placeholder' | 'read' | 'write' | 'send' | 'receive' | 'notify';
  name: string;
  note: string;
  structId?: string;
  localName?: string;
  taskId?: string;
  timeoutMs?: number;
  timeoutExpression?: string;
  timeoutLiteral?: string;
  timeoutSetting?: string;
  onFailure?: 'continue' | 'return' | 'assert';
  requiresCode?: boolean;
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
  trigger?: 'periodic' | 'queue' | 'queues' | 'notification';
  queueId?: string;
  queueIds?: string[];
  periodExpression?: string;
  priorityExpression?: string;
  stackExpression?: string;
  coreExpression?: string;
  configValues?: Record<string, string>;
  parameters?: TaskParameter[];
  configNamespace?: string;
  configKeys?: string[];
  description?: string;
  icon?: string;
  libraryIds?: string[];
  setup: Step[];
  loop: Step[];
};
export type Field = {
  id: string;
  name: string;
  type: string;
  initialValue: string;
  arrayLength?: number;
};
export type DataType = {
  id: string;
  name: string;
  kind: 'struct' | 'enum' | 'external';
  fields: Field[];
  values: { id: string; name: string; value: string }[];
  cppType: string;
  headers: string[];
  libraryIds: string[];
};
export type TaskParameter = {
  type?: string;
  name: string;
  label: string;
  description: string;
  value: string;
};
export type ConfigFile = { path: string; content: string };
export type SharedStruct = {
  id: string;
  kind: 'struct';
  name: string;
  symbol: string;
  typeName: string;
  position: Position;
  fields: Field[];
  delivery?: 'snapshot' | 'queue' | 'mailbox';
  capacity?: number;
  capacityExpression?: string;
  capacityLiteral?: string;
  configNamespace?: string;
  configKeys?: string[];
  payloadTypeId?: string;
};
export type LayoutNode = Task | SharedStruct;
export type Project = {
  version: 1;
  name: string;
  target: 'esp32s3' | 'esp32' | 'esp32c3';
  nodes: LayoutNode[];
  libraries?: Library[];
  code?: Record<string, string>;
  types?: DataType[];
  configFile?: ConfigFile;
  extraFiles?: Record<string, string>;
  buildFiles?: Record<string, string>;
  sourceFiles?: Record<
    string,
    { content: string; generated: string; taskId?: string }
  >;
  libraryLocks?: Record<string, unknown>;
  imported?: {
    target: Project['target'];
    configPath: string;
    nodes: LayoutNode[];
    types: DataType[];
    libraries: Library[];
  };
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
export type TaskTemplate = {
  id: string;
  name: string;
  description: string;
  icon: string;
  task: Task;
  libraries: Library[];
  code: Record<string, string>;
};
export type Catalog<T> = { items: T[]; errors: string[]; path: string };
export type Diagnostic = {
  severity: 'error' | 'warning';
  message: string;
  nodeId: string;
};
export type Preview = {
  valid: boolean;
  diagnostics: Diagnostic[];
  files: Record<string, string>;
  configContent?: string;
  stepStates?: Record<string, string>;
  stepCode?: Record<string, string>;
  connectionCode?: Record<string, string>;
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
} | null;
export type Phase = 'setup' | 'loop';
export interface DesktopApi {
  initialAppearance: Appearance;
  setAppearance(appearance: Appearance): Promise<void>;
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
  newDocument(project: Project): Promise<void>;
  revealExport(): Promise<void>;
  templates(): Promise<Catalog<TaskTemplate>>;
  saveTemplate(template: TaskTemplate): Promise<Catalog<TaskTemplate>>;
  deleteTemplate(id: string): Promise<Catalog<TaskTemplate>>;
  revealTemplates(): Promise<void>;
  librariesCatalog(): Promise<Catalog<Library>>;
  saveLibraryDefault(library: Library): Promise<Catalog<Library>>;
  revealLibraries(): Promise<void>;
  importConfig(project: Project): Promise<Project | null>;
  instantiateTemplate(
    project: Project,
    template: TaskTemplate,
    position: Position,
  ): Promise<Project>;
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
