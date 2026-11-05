import type { Project } from './model';

export const importedNode = (p: Project | null | undefined, id?: string) =>
  p?.imported?.nodes.find((n) => n.id === id);
export const importedStep = (
  p: Project | null | undefined,
  taskId: string,
  stepId: string,
) => {
  const node = importedNode(p, taskId);
  return (
    node?.kind === 'task' &&
    [...node.setup, ...node.loop].some((s) => s.id === stepId)
  );
};
export function lockedConnection(p: Project, id: string) {
  if (id.startsWith('trigger:')) return !!importedNode(p, id.split(':')[1]);
  return (
    p.imported?.nodes.some(
      (n) =>
        n.kind === 'task' && [...n.setup, ...n.loop].some((s) => s.id === id),
    ) ?? false
  );
}
const pick = (value: object, keys: string[]) =>
  Object.fromEntries(
    keys.map((key) => [key, (value as Record<string, unknown>)[key] ?? null]),
  );
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
const taskKeys = [
  'kind',
  'symbol',
  'configNamespace',
  'trigger',
  'queueId',
  'queueIds',
];
const structKeys = [
  'kind',
  'symbol',
  'typeName',
  'configNamespace',
  'delivery',
  'payloadTypeId',
  'fields',
];
const stepKeys = [
  'id',
  'name',
  'kind',
  'note',
  'structId',
  'localName',
  'taskId',
  'onFailure',
  'timeoutSetting',
  'placement',
];
const libraryKeys = [
  'id',
  'name',
  'source',
  'repository',
  'version',
  'headers',
  'dependencies',
];
export function importViolation(p: Project): string | undefined {
  const baseline = p.imported;
  if (!baseline) return;
  if (
    p.target !== baseline.target ||
    (p.configFile?.path ?? 'config/Config.hpp') !== baseline.configPath
  )
    return 'The imported target and config file path are read-only.';
  for (const original of baseline.nodes) {
    const current = p.nodes.find((n) => n.id === original.id);
    if (!current) return 'Imported tasks and data cannot be deleted.';
    if (
      !same(
        pick(current, original.kind === 'task' ? taskKeys : structKeys),
        pick(original, original.kind === 'task' ? taskKeys : structKeys),
      )
    )
      return 'Imported names in C++, payload definitions and trigger interfaces are read-only.';
    if (original.kind === 'task' && current.kind === 'task') {
      for (const phase of ['setup', 'loop'] as const) {
        const ids = new Set(original[phase].map((s) => s.id));
        const existing = current[phase].filter((s) => ids.has(s.id));
        if (
          !same(
            existing.map((s) => pick(s, stepKeys)),
            original[phase].map((s) => pick(s, stepKeys)),
          )
        )
          return 'Imported steps and connections cannot be edited, reordered or removed.';
        if (
          current[phase].some((s) => !ids.has(s.id) && s.kind === 'placeholder')
        )
          return 'Add input or output connectors to imported tasks; their existing flow is read-only.';
      }
      if (
        (original.libraryIds ?? []).some(
          (id) => !current.libraryIds?.includes(id),
        )
      )
        return 'Imported library assignments cannot be removed.';
      for (const parameter of original.parameters ?? []) {
        if (
          !current.parameters?.some(
            (q) =>
              q.name === parameter.name &&
              (q.type ?? 'auto') === (parameter.type ?? 'auto'),
          )
        )
          return 'Imported config setting names and types are read-only; their values remain editable.';
      }
    }
  }
  for (const type of baseline.types)
    if (
      !same(
        p.types?.find((t) => t.id === type.id),
        type,
      )
    )
      return 'Imported data types are read-only.';
  for (const lib of baseline.libraries) {
    const current = p.libraries?.find((l) => l.id === lib.id);
    if (!current || !same(pick(current, libraryKeys), pick(lib, libraryKeys)))
      return 'Imported library definitions are read-only.';
  }
}
