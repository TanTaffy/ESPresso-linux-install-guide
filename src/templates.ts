import { uid, type Project, type Task, type TaskTemplate } from './model';

export const sectionKey = (kind: string, id: string) =>
  `${kind}-${Array.from(new TextEncoder().encode(id), (b) => b.toString(16).padStart(2, '0')).join('')}`;
export const withNewline = (text: string) =>
  text && !text.endsWith('\n') ? `${text}\n` : text;

export function captureTemplate(
  project: Project,
  original?: Task,
): TaskTemplate {
  const id = uid();
  const task: Task = original
    ? structuredClone(original)
    : {
        id,
        kind: 'task',
        name: 'Custom task',
        symbol: 'custom',
        position: { x: 0, y: 0 },
        periodMs: 100,
        priority: 2,
        stackBytes: 4096,
        core: 'any',
        setup: [],
        loop: [],
      };
  if (task.trigger === 'queue' || task.trigger === 'queues')
    task.trigger = 'periodic';
  delete task.queueId;
  delete task.queueIds;
  delete task.configNamespace;
  delete task.configKeys;
  for (const phase of ['setup', 'loop'] as const)
    task[phase] = task[phase].filter((s) => s.kind === 'placeholder');
  const code: Record<string, string> = {};
  for (const kind of [
    'includes',
    'helpers',
    'state',
    'setupvars',
    'loopvars',
  ]) {
    const key = sectionKey(kind, task.id);
    if (project.code?.[key] !== undefined) code[key] = project.code[key];
  }
  for (const step of [...task.setup, ...task.loop]) {
    const key = sectionKey('step', step.id);
    if (project.code?.[key] !== undefined) code[key] = project.code[key];
  }
  const ids = new Set(task.libraryIds ?? []);
  return {
    id,
    name: task.name,
    description: task.description ?? '',
    icon: task.icon ?? '',
    task,
    code,
    libraries: structuredClone(
      (project.libraries ?? []).filter((l) => ids.has(l.id)),
    ),
  };
}
