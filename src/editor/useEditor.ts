import type {
  Connection,
  Edge,
  NodeChange,
  ReactFlowInstance,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  uid,
  type LayoutNode,
  type Phase,
  type Preview,
  type Project,
  type SharedStruct,
  type Step,
  type Task,
  type TaskTemplate,
} from '../model';
import {
  importedNode,
  importedStep,
  lockedConnection,
  importViolation,
} from '../imported';
import { captureTemplate, withNewline } from '../templates';
import type { FlowNode, StepSelection, View } from './types';
import {
  syncCodeNames,
  stepLabel,
  availableSymbol,
  sampleType,
} from './naming';
import { freePosition } from './placement';

export function useEditor() {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [templateFolder, setTemplateFolder] = useState('');
  const [templateErrors, setTemplateErrors] = useState<string[]>([]);
  const [templatePicker, setTemplatePicker] = useState(false);
  const [templateDraft, setTemplateDraft] = useState<TaskTemplate | null>(null);
  const [project, setProject] = useState<Project | null>(null),
    [view, setViewState] = useState<View>('canvas');
  const navigationGuard = useRef<(() => boolean) | null>(null);
  const registerNavigationGuard = useCallback(
    (guard: (() => boolean) | null) => {
      navigationGuard.current = guard;
    },
    [],
  );
  function setView(next: View) {
    if (next !== view && navigationGuard.current && !navigationGuard.current())
      return;
    setViewState(next);
  }
  const [projectSetup, setProjectSetup] = useState(false);
  const [recovery, setRecovery] = useState<{ name: string } | null>(null);
  const [importPicker, setImportPicker] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>('task-adc'),
    [stepSelection, setStepSelection] = useState<StepSelection | null>(null);
  const [nodeDimensions, setNodeDimensions] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [showSteps, setShowSteps] = useState(true),
    [preview, setPreview] = useState<Preview | null>(null),
    [checking, setChecking] = useState(false);
  const [file, setFile] = useState('main/tasks/adc_task.cpp'),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const [dirty, setDirty] = useState(false),
    [savedPath, setSavedPath] = useState<string | null>(null),
    [busy, setBusy] = useState(false),
    [exportPath, setExportPath] = useState('');
  const [exportParent, setExportParent] = useState('');
  const [undo, setUndo] = useState<Project[]>([]),
    [redo, setRedo] = useState<Project[]>([]),
    [confirm, setConfirm] = useState<
      null | 'new' | 'example' | 'open' | 'import'
    >(null);
  const flow = useRef<ReactFlowInstance<FlowNode> | null>(null),
    dragHistory = useRef(false);
  const fitPending = useRef(false);
  const exportedNames = useRef(
    new Map<string, { symbol: string; typeName?: string }>(),
  );
  function retainExportedNames(p: Project) {
    for (const node of p.nodes) {
      const names = exportedNames.current.get(node.id);
      if (!names) continue;
      const oldSymbol = node.symbol;
      node.symbol = names.symbol;
      node.codeNamesLocked = true;
      if (node.kind === 'struct') {
        node.typeName = names.typeName!;
        for (const t of p.nodes)
          if (t.kind === 'task' && !importedNode(p, t.id))
            for (const step of [...t.setup, ...t.loop])
              if (step.structId === node.id && step.localName === oldSymbol)
                step.localName = names.symbol;
      }
    }
    return p;
  }
  const [fitRevision, setFitRevision] = useState(0);
  const selected = project?.nodes.find((n) => n.id === selectedId),
    tasks = project?.nodes.filter((n): n is Task => n.kind === 'task') ?? [],
    structs =
      project?.nodes.filter((n): n is SharedStruct => n.kind === 'struct') ??
      [];
  const task = selected?.kind === 'task' ? selected : tasks[0],
    shared = selected?.kind === 'struct' ? selected : structs[0];
  const selectedStep =
    task && stepSelection
      ? task[stepSelection.phase].find((s) => s.id === stepSelection.id)
      : undefined;
  const notify = useCallback((text: string) => {
    setMessage(text);
  }, []);
  const run = useCallback(
    async <T>(operation: () => Promise<T>): Promise<T | undefined> => {
      setBusy(true);
      setError('');
      try {
        return await operation();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [],
  );
  async function refreshTemplates() {
    const result = await run(() => window.espresso.templates());
    if (result) {
      setTemplates(result.items);
      setTemplateFolder(result.path);
      setTemplateErrors(result.errors);
    }
  }
  useEffect(() => {
    if (window.espresso) void refreshTemplates();
  }, []);
  useEffect(() => {
    let alive = true;
    if (!window.espresso) {
      setError('Launch ESPresso as a desktop app with npm start.');
      return;
    }
    window.espresso
      .boot()
      .then((result) => {
        if (!alive) return;
        setProject(result.project);
        setRecovery(result.recovery ?? null);
        setProjectSetup(!result.recovery && !result.project.nodes.length);
        setSelectedId(
          result.project.nodes.find((n) => n.kind === 'task')?.id ?? null,
        );
        if (result.recoveryError) setError(result.recoveryError);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, [notify]);
  useEffect(() => {
    if (!project) return;
    let alive = true;
    setChecking(true);
    const timer = setTimeout(() => {
      window.espresso
        .preview(project)
        .then((p) => {
          if (alive) {
            setPreview(p);
            setChecking(false);
          }
        })
        .catch((e) => {
          if (alive) {
            setError(String(e));
            setChecking(false);
          }
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [project]);
  useEffect(() => {
    if (!project || (!dirty && !savedPath)) return;
    void window.espresso
      .draft(project, dirty)
      .catch((e) => setError(`Recovery copy failed: ${e}`));
  }, [project, dirty, savedPath]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 4000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    if (
      !fitPending.current ||
      view !== 'canvas' ||
      !project?.nodes.length ||
      !flow.current
    )
      return;
    if (!project.nodes.every((node) => nodeDimensions[node.id])) return;
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      void flow.current
        ?.fitView({ padding: 0.15, maxZoom: 1 })
        .then((success) => {
          if (success && !cancelled) fitPending.current = false;
        });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [view, project, nodeDimensions, fitRevision]);
  function change(edit: (p: Project) => void) {
    if (!project) return;
    const next = structuredClone(project);
    edit(next);
    retainExportedNames(next);
    const violation = importViolation(next);
    if (violation) {
      notify(violation);
      return;
    }
    setUndo((h) => [...h.slice(-79), project]);
    setRedo([]);
    setProject(next);
    setDirty(true);
  }
  function updateNode(id: string, edit: (node: LayoutNode) => void) {
    change((p) => {
      const n = p.nodes.find((n) => n.id === id);
      if (n) {
        const before = structuredClone(n);
        edit(n);
        syncCodeNames(p, before, n);
      }
    });
  }
  function updateTask(edit: (t: Task) => void) {
    if (task)
      updateNode(task.id, (n) => {
        if (n.kind === 'task') edit(n);
      });
  }
  function updateShared(edit: (s: SharedStruct) => void) {
    if (shared)
      updateNode(shared.id, (n) => {
        if (n.kind === 'struct') edit(n);
      });
  }
  function undoAction() {
    if (!project || !undo.length) return;
    setRedo((h) => [...h, project]);
    setProject(retainExportedNames(structuredClone(undo.at(-1)!)));
    setUndo((h) => h.slice(0, -1));
    setDirty(true);
  }
  function redoAction() {
    if (!project || !redo.length) return;
    setUndo((h) => [...h, project]);
    setProject(retainExportedNames(structuredClone(redo.at(-1)!)));
    setRedo((h) => h.slice(0, -1));
    setDirty(true);
  }
  async function save(saveAs = false) {
    if (!project) return;
    if (project.name === 'untitled-project') {
      setProjectSetup(true);
      return;
    }
    const result = await run(() => window.espresso.save(project, saveAs));
    if (result) {
      setSavedPath(result.path);
      setDirty(false);
      notify('Layout saved');
    }
  }
  async function resolveRecovery(recover: boolean) {
    await run(async () => {
      const restored = await window.espresso.resolveRecovery(recover);
      if (restored) {
        setProject(restored);
        setDirty(true);
        setSelectedId(restored.nodes[0]?.id ?? null);
        fitPending.current = true;
        setFitRevision((value) => value + 1);
        notify('Previous session recovered. Save your layout to keep it.');
      } else {
        setProjectSetup(true);
      }
      setRecovery(null);
    });
  }
  async function replaceDocument(
    action: 'new' | 'example' | 'open' | 'import',
    importMode?: 'file' | 'folder',
  ) {
    if (action === 'import' && !importMode) {
      setConfirm(null);
      setError('');
      setImportPicker(true);
      return;
    }
    await run(async () => {
      if (action === 'import') {
        const result = await window.espresso.importProject(importMode);
        if (!result) return;
        setImportPicker(false);
        setProject(result.project);
        setSavedPath(null);
        setSelectedId(result.project.nodes[0]?.id ?? null);
        notify('Project imported. Code preserved as a snapshot.');
      } else if (action === 'open') {
        const result = await window.espresso.open();
        if (!result) return;
        setProject(result.project);
        setSavedPath(result.path);
        setSelectedId(result.project.nodes[0]?.id ?? null);
        notify('Layout opened');
      } else {
        const p =
          action === 'new'
            ? await window.espresso.empty()
            : await window.espresso.example();
        await window.espresso.newDocument(p);
        setProject(p);
        setProjectSetup(action === 'new');
        setSavedPath(null);
        setSelectedId(p.nodes[0]?.id ?? null);
        notify(action === 'new' ? 'New layout' : 'Pressure example loaded');
      }
      setUndo([]);
      exportedNames.current.clear();
      fitPending.current = true;
      setFitRevision((value) => value + 1);
      setRedo([]);
      setDirty(action === 'import');
      setStepSelection(null);
      setView('canvas');
      setExportPath('');
      setExportParent('');
    });
    setConfirm(null);
  }
  function requestDocument(action: 'new' | 'example' | 'open' | 'import') {
    if (navigationGuard.current && !navigationGuard.current()) return;
    if (dirty) setConfirm(action);
    else void replaceDocument(action);
  }
  function editNode(id: string) {
    setSelectedId(id);
    setStepSelection(null);
    setView(
      project?.nodes.find((n) => n.id === id)?.kind === 'struct'
        ? 'struct'
        : 'task',
    );
  }
  function editStep(taskId: string, phase: Phase, id: string) {
    setSelectedId(taskId);
    setStepSelection({ phase, id });
    setView('task');
  }
  function uniqueSymbol(kind: 'task' | 'struct') {
    let i = 1;
    while (project?.nodes.some((n) => n.symbol === `${kind}_${i}`)) i++;
    return { i, symbol: `${kind}_${i}` };
  }
  function addNode(
    kind: 'task' | 'struct' | 'queue',
    position?: { x: number; y: number },
  ) {
    const { i, symbol } = uniqueSymbol(kind === 'queue' ? 'struct' : kind);
    const id = uid();
    const origin = position ??
      flow.current?.screenToFlowPosition({
        x: window.innerWidth * 0.43,
        y: window.innerHeight * 0.4,
      }) ?? { x: 80, y: 80 };
    const pos = freePosition(project?.nodes ?? [], nodeDimensions, origin);
    const node: LayoutNode =
      kind === 'task'
        ? {
            id,
            kind,
            name: `Task ${i}`,
            symbol,
            position: pos,
            periodMs: 100,
            priority: 2,
            stackBytes: 4096,
            core: 'any',
            setup: [],
            loop: [],
          }
        : {
            id,
            kind: 'struct',
            name: `Data ${i}`,
            symbol,
            typeName: `Data${i}Sample`,
            position: pos,
            fields: [],
            ...(kind === 'queue'
              ? { delivery: 'queue' as const, capacity: 8 }
              : {}),
          };
    change((p) => p.nodes.push(node));
    setSelectedId(id);
    setStepSelection(null);
    setView('canvas');
    fitPending.current = true;
    notify(`${kind === 'task' ? 'Task' : 'Data'} added`);
  }
  function connectorLocal(taskId: string, proposed: string, except?: string) {
    if (!importedNode(project, taskId)) return proposed;
    const task = project?.nodes.find((n) => n.id === taskId);
    const source = Object.values(project?.sourceFiles ?? {})
      .filter((file) => file.taskId === taskId)
      .map((file) => file.content)
      .join('\n');
    const used = new Set(source.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []);
    if (task?.kind === 'task')
      for (const step of [...task.setup, ...task.loop])
        if (step.id !== except && step.localName) used.add(step.localName);
    let local = proposed,
      suffix = 2;
    while (used.has(local)) local = `${proposed}_${suffix++}`;
    return local;
  }
  function addTaskData(direction: 'input' | 'output') {
    if (!project || !task) return;
    const id = uid(),
      name = `${task.name} ${direction === 'output' ? 'output' : 'input'}`;
    const symbol = availableSymbol(project, name);
    const data: SharedStruct = {
      id,
      kind: 'struct',
      name,
      symbol,
      typeName: sampleType(symbol),
      fields: [],
      delivery: 'queue',
      capacity: 8,
      position: freePosition(project.nodes, nodeDimensions, {
        x: task.position.x + (direction === 'output' ? 360 : -360),
        y: task.position.y,
      }),
    };
    change((p) => {
      p.nodes.push(data);
      const target = p.nodes.find((n) => n.id === task.id);
      if (target?.kind !== 'task') return;
      if (direction === 'input' && !importedNode(p, target.id)) {
        if (target.trigger === 'queues')
          target.queueIds = [...(target.queueIds ?? []), id];
        else if (target.trigger === 'queue' && target.queueId) {
          target.trigger = 'queues';
          target.queueIds = [target.queueId, id];
          delete target.queueId;
        } else {
          target.trigger = 'queue';
          target.queueId = id;
        }
      } else
        target.loop.push({
          id: uid(),
          kind: direction === 'output' ? 'send' : 'receive',
          name: stepLabel(direction === 'output' ? 'send' : 'receive', data),
          note: '',
          structId: id,
          localName: connectorLocal(task.id, symbol),
          timeoutMs: 0,
          onFailure: 'return',
          ...(importedNode(p, target.id)
            ? {
                placement:
                  direction === 'input' ? ('start' as const) : ('end' as const),
              }
            : {}),
        });
    });
    setSelectedId(id);
    setStepSelection(null);
    setView('struct');
    fitPending.current = true;
    notify('Data connected. Name it and add the fields in each sample.');
  }
  async function saveTemplate(template: TaskTemplate) {
    template = structuredClone(template);
    template.code = Object.fromEntries(
      Object.entries(template.code).map(([key, value]) => [
        key,
        withNewline(value),
      ]),
    );
    const result = await run(() => window.espresso.saveTemplate(template));
    if (!result) return;
    setTemplates(result.items);
    setTemplateFolder(result.path);
    setTemplateErrors(result.errors);
    setTemplateDraft(null);
    notify('Task type saved to your reusable templates');
  }
  async function deleteTemplate(id: string) {
    const result = await run(() => window.espresso.deleteTemplate(id));
    if (!result) return;
    setTemplates(result.items);
    setTemplateFolder(result.path);
    setTemplateErrors(result.errors);
    if (templateDraft?.id === id) setTemplateDraft(null);
    notify('Task type deleted. Existing tasks are retained.');
  }
  async function addTemplateTask(
    id: string,
    position?: { x: number; y: number },
  ) {
    const template = templates.find((t) => t.id === id);
    if (!project || !template) return;
    const base = project;
    const origin = position ??
      flow.current?.screenToFlowPosition({
        x: window.innerWidth * 0.43,
        y: window.innerHeight * 0.4,
      }) ?? { x: 80, y: 80 };
    const pos = freePosition(project.nodes, nodeDimensions, origin);
    const result = await run(() =>
      window.espresso.instantiateTemplate(base, template, pos),
    );
    if (!result) return;
    change((p) => {
      p.nodes = result.nodes;
      p.libraries = result.libraries;
      p.code = result.code;
    });
    setSelectedId(result.nodes.at(-1)!.id);
    setView('canvas');
    fitPending.current = true;
    notify(`${template.name} added`);
  }
  function newTemplate(fromTask?: Task) {
    if (!project) return;
    setTemplateDraft(captureTemplate(project, fromTask));
    setView('templates');
  }
  function removeNode(id: string) {
    const n = project?.nodes.find((n) => n.id === id);
    if (!n) return;
    if (importedNode(project, id)) {
      notify('Imported tasks and data cannot be deleted.');
      return;
    }
    change((p) => {
      p.nodes = p.nodes.filter((n) => n.id !== id);
      for (const t of p.nodes)
        if (t.kind === 'task')
          for (const phase of ['setup', 'loop'] as Phase[])
            t[phase] = t[phase].filter(
              (s) =>
                (s.kind === 'placeholder' || s.structId !== id) &&
                s.taskId !== id,
            );
      for (const t of p.nodes)
        if (t.kind === 'task') {
          if (t.queueId === id) delete t.queueId;
          t.queueIds = t.queueIds?.filter((q) => q !== id);
        }
    });
    setSelectedId(null);
    setStepSelection(null);
    notify(`${n.name} deleted. Undo is available.`);
  }
  function addStep(phase: Phase, kind: Step['kind'] = 'placeholder') {
    if (
      task &&
      importedNode(project, task.id) &&
      (kind === 'placeholder' || phase !== 'loop')
    )
      return;
    const id = uid();
    const s: Step = {
      id,
      kind,
      name:
        kind === 'placeholder'
          ? 'New placeholder'
          : kind === 'notify'
            ? 'Notify task'
            : kind === 'send'
              ? 'Send message'
              : kind === 'receive'
                ? 'Receive message'
                : kind === 'read'
                  ? 'Read shared data'
                  : 'Publish shared data',
      note: '',
      ...(task && importedNode(project, task.id)
        ? {
            placement:
              kind === 'read' || kind === 'receive'
                ? ('start' as const)
                : ('end' as const),
          }
        : {}),
      ...(kind === 'notify'
        ? { taskId: tasks.find((t) => t.trigger === 'notification')?.id ?? '' }
        : kind !== 'placeholder'
          ? {
              structId:
                structs.find(
                  (s) =>
                    (s.delivery === 'queue' || s.delivery === 'mailbox') ===
                    (kind === 'send' || kind === 'receive'),
                )?.id ?? '',
              localName:
                structs.find(
                  (s) =>
                    (s.delivery === 'queue' || s.delivery === 'mailbox') ===
                    (kind === 'send' || kind === 'receive'),
                )?.symbol ?? 'message',
              ...(kind === 'send' || kind === 'receive'
                ? { timeoutMs: 0, onFailure: 'return' as const }
                : {}),
            }
          : {}),
    };
    if (kind !== 'placeholder' && kind !== 'notify')
      s.name = stepLabel(
        kind,
        structs.find((data) => data.id === s.structId),
      );
    if (s.placement && s.localName && task)
      s.localName = connectorLocal(task.id, s.localName);
    updateTask((t) => t[phase].push(s));
    setStepSelection({ phase, id });
  }
  function changeStep(edit: (s: Step) => void) {
    if (!stepSelection) return;
    updateTask((t) => {
      const s = t[stepSelection.phase].find((s) => s.id === stepSelection.id);
      if (s) {
        const before = { ...s };
        delete before.requiresCode;
        edit(s);
        if (
          s.kind !== 'placeholder' &&
          s.kind !== 'notify' &&
          (s.structId !== before.structId || s.kind !== before.kind)
        )
          s.name = stepLabel(
            s.kind,
            structs.find((data) => data.id === s.structId),
          );
        if (
          s.placement &&
          s.localName &&
          (s.structId !== before.structId || s.kind !== before.kind)
        )
          s.localName = connectorLocal(t.id, s.localName, s.id);
        const after = { ...s };
        delete after.requiresCode;
        if (
          importedNode(project, t.id) &&
          !importedStep(project, t.id, s.id) &&
          !s.placement &&
          JSON.stringify(before) !== JSON.stringify(after)
        )
          s.requiresCode = true;
      }
    });
  }
  function moveStep(phase: Phase, id: string, offset: number) {
    updateTask((t) => {
      const selected = t[phase].find((s) => s.id === id);
      if (selected?.placement && importedNode(project, t.id)) {
        const group = t[phase].filter(
          (s) =>
            s.placement === selected.placement &&
            !importedStep(project, t.id, s.id),
        );
        const from = group.findIndex((s) => s.id === id),
          to = from + offset;
        if (to >= 0 && to < group.length) {
          const a = t[phase].indexOf(group[from]),
            b = t[phase].indexOf(group[to]);
          [t[phase][a], t[phase][b]] = [t[phase][b], t[phase][a]];
        }
        return;
      }
      const list = t[phase],
        i = list.findIndex((s) => s.id === id),
        j = i + offset;
      if (i >= 0 && j >= 0 && j < list.length)
        [list[i], list[j]] = [list[j], list[i]];
    });
  }
  function reorder(phase: Phase, from: string, to: string) {
    updateTask((t) => {
      if (importedNode(project, t.id)) {
        const a = t[phase].find((s) => s.id === from),
          b = t[phase].find((s) => s.id === to);
        if (
          !a?.placement ||
          a.placement !== b?.placement ||
          importedStep(project, t.id, from) ||
          importedStep(project, t.id, to)
        )
          return;
      }
      const list = t[phase],
        i = list.findIndex((s) => s.id === from),
        j = list.findIndex((s) => s.id === to);
      if (i >= 0 && j >= 0) {
        const [s] = list.splice(i, 1);
        list.splice(j, 0, s);
      }
    });
  }
  function connect(c: Connection) {
    const source = project?.nodes.find((n) => n.id === c.source),
      target = project?.nodes.find((n) => n.id === c.target);
    if (!source || !target) return;
    if (source.kind === 'task' && target.kind === 'task') {
      if (target.trigger !== 'notification') {
        notify('Choose Task notification as the target loop trigger first');
        return;
      }
      const existing = c.sourceHandle?.startsWith('step:')
        ? c.sourceHandle.slice(5)
        : null;
      if (existing && importedStep(project, source.id, existing)) {
        notify(
          'Imported connectors are read-only. Use the task’s main output port to add another.',
        );
        return;
      }
      updateNode(source.id, (n) => {
        if (n.kind !== 'task') return;
        const step = [...n.setup, ...n.loop].find(
          (s) => s.id === existing && s.kind === 'notify',
        );
        if (step) {
          step.taskId = target.id;
          if (importedNode(project, source.id) && !step.placement)
            step.requiresCode = true;
        } else
          n.loop.push({
            id: uid(),
            kind: 'notify',
            name: `Notify ${target.name}`,
            note: '',
            ...(importedNode(project, source.id)
              ? { placement: 'end' as const }
              : {}),
            taskId: target.id,
          });
      });
      notify('Task notification connected');
      return;
    }
    if (source.kind === target.kind) return;
    const t = source.kind === 'task' ? source : (target as Task),
      s = source.kind === 'struct' ? source : (target as SharedStruct),
      kind =
        source.kind === 'task'
          ? s.delivery === 'queue' || s.delivery === 'mailbox'
            ? 'send'
            : 'write'
          : s.delivery === 'queue' || s.delivery === 'mailbox'
            ? 'receive'
            : 'read',
      handle = source.kind === 'task' ? c.sourceHandle : c.targetHandle;
    const existing = handle?.startsWith('step:') ? handle.slice(5) : null;
    if (existing && importedStep(project, t.id, existing)) {
      notify(
        'Imported connectors are read-only. Use the task’s main input or output port to add another.',
      );
      return;
    }
    if (existing) {
      updateNode(t.id, (n) => {
        if (n.kind === 'task')
          for (const phase of ['setup', 'loop'] as Phase[]) {
            const step = n[phase].find((st) => st.id === existing);
            if (step) {
              step.kind = kind;
              delete step.taskId;
              step.structId = s.id;
              step.localName = connectorLocal(t.id, s.symbol, step.id);
              if (importedNode(project, t.id) && !step.placement)
                step.requiresCode = true;
            }
          }
      });
      notify('Connection updated');
      return;
    }
    const duplicate = t.loop.find(
      (step) => step.kind === kind && step.structId === s.id,
    );
    if (duplicate) {
      setSelectedId(t.id);
      notify('That loop connection already exists');
      return;
    }
    const step: Step = {
      id: uid(),
      kind,
      name: `${kind === 'write' ? 'Publish' : kind === 'send' ? 'Send' : kind === 'receive' ? 'Receive' : 'Read'} ${s.name.toLowerCase()}`,
      note: '',
      structId: s.id,
      localName: connectorLocal(t.id, s.symbol),
      ...(importedNode(project, t.id)
        ? {
            placement:
              kind === 'read' || kind === 'receive'
                ? ('start' as const)
                : ('end' as const),
          }
        : {}),
      ...(kind === 'send' || kind === 'receive'
        ? { timeoutMs: 0, onFailure: 'return' as const }
        : {}),
    };
    updateNode(t.id, (n) => {
      if (n.kind === 'task') {
        if (kind === 'read' || kind === 'receive') n.loop.unshift(step);
        else n.loop.push(step);
      }
    });
    setSelectedId(t.id);
    notify(
      `${kind === 'write' ? 'Publish' : kind === 'send' ? 'Send' : kind === 'receive' ? 'Receive' : 'Read'} step added to ${t.name}.loop()`,
    );
  }
  function removeConnection(stepId: string) {
    if (project && lockedConnection(project, stepId)) {
      notify('Imported connections cannot be removed.');
      return;
    }
    if (stepId.startsWith('trigger:')) {
      const [, taskId, queueId] = stepId.split(':');
      updateNode(taskId, (n) => {
        if (n.kind !== 'task') return;
        if (n.trigger === 'queues')
          n.queueIds = n.queueIds?.filter((id) => id !== queueId);
        else {
          n.trigger = 'periodic';
          delete n.queueId;
        }
      });
      notify('Queue trigger removed');
      return;
    }
    change((p) => {
      for (const t of p.nodes)
        if (t.kind === 'task')
          for (const phase of ['setup', 'loop'] as Phase[])
            t[phase] = t[phase].filter((s) => s.id !== stepId);
    });
    notify('Connection and its access step removed');
  }
  const graphNodes: FlowNode[] = useMemo(
    () =>
      project?.nodes.map((n) => ({
        id: n.id,
        type: 'layout',
        position: n.position,
        measured: nodeDimensions[n.id],
        selected: n.id === selectedId,
        data: {
          node: n,
          showSteps,
          imported: !!importedNode(project, n.id),
          lockedSteps:
            n.kind === 'task'
              ? [...n.setup, ...n.loop]
                  .filter((s) => importedStep(project, n.id, s.id))
                  .map((s) => s.id)
              : [],
          types: project.types ?? [],
          edit: editNode,
          step: editStep,
        },
      })) ?? [],
    [project, selectedId, showSteps, nodeDimensions],
  );
  const graphEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    const dataEdgeOptions = {
      style: { stroke: 'var(--data)', strokeWidth: 1.8 },
      labelStyle: { fill: 'var(--data-text)', fontSize: 11 },
      labelBgStyle: { fill: 'var(--canvas)' },
      interactionWidth: 22,
    };
    for (const t of tasks)
      for (const id of t.trigger === 'queues'
        ? (t.queueIds ?? [])
        : t.trigger === 'queue' && t.queueId
          ? [t.queueId]
          : [])
        if (structs.some((s) => s.id === id))
          edges.push({
            ...dataEdgeOptions,
            id: `trigger:${t.id}:${id}`,
            deletable: !importedNode(project, t.id),
            source: id,
            target: t.id,
            sourceHandle: 'read',
            targetHandle: 'read-new',
            type: 'smoothstep',
            label: 'wake + receive',
            style: { ...dataEdgeOptions.style, strokeDasharray: '5 3' },
          });
    for (const t of tasks)
      for (const phase of ['setup', 'loop'] as Phase[])
        for (const s of t[phase]) {
          if (s.kind === 'notify') {
            if (tasks.some((n) => n.id === s.taskId))
              edges.push({
                id: s.id,
                deletable: !lockedConnection(project!, s.id),
                source: t.id,
                target: s.taskId!,
                sourceHandle: showSteps ? `step:${s.id}` : 'write-new',
                targetHandle: 'read-new',
                type: 'smoothstep',
                label: s.requiresCode
                  ? 'notify · Requires code update'
                  : 'notify',
                style: { stroke: 'var(--accent)' },
              });
            continue;
          }
          if (
            s.kind === 'placeholder' ||
            !structs.some((n) => n.id === s.structId)
          )
            continue;
          edges.push({
            ...dataEdgeOptions,
            id: s.id,
            deletable: !lockedConnection(project!, s.id),
            source:
              s.kind === 'write' || s.kind === 'send' ? t.id : s.structId!,
            target:
              s.kind === 'write' || s.kind === 'send' ? s.structId! : t.id,
            sourceHandle:
              s.kind === 'write' || s.kind === 'send'
                ? showSteps
                  ? `step:${s.id}`
                  : 'write-new'
                : 'read',
            targetHandle:
              s.kind === 'read' || s.kind === 'receive'
                ? showSteps
                  ? `step:${s.id}`
                  : 'read-new'
                : 'write',
            type: 'smoothstep',
            label: s.requiresCode ? `${s.kind} · Requires code update` : s.kind,
          });
        }
    return edges;
  }, [project, showSteps]);
  function nodeChanges(changes: NodeChange<FlowNode>[]) {
    const dimensions = changes.filter(
      (c): c is Extract<NodeChange<FlowNode>, { type: 'dimensions' }> =>
        c.type === 'dimensions' && !!c.dimensions,
    );
    if (dimensions.length)
      setNodeDimensions((old) => {
        const next = { ...old };
        for (const c of dimensions) if (c.dimensions) next[c.id] = c.dimensions;
        return next;
      });
    const positions = changes.filter(
      (c): c is Extract<NodeChange<FlowNode>, { type: 'position' }> =>
        c.type === 'position' && !!c.position,
    );
    if (!positions.length) return;
    setProject((p) =>
      p
        ? {
            ...p,
            nodes: p.nodes.map((n) => {
              const c = positions.find((c) => c.id === n.id);
              return c?.type === 'position' && c.position
                ? { ...n, position: c.position }
                : n;
            }),
          }
        : p,
    );
  }
  async function exportProject() {
    if (!project) return;
    if (!exportParent) {
      await chooseExportFolder();
      return;
    }
    const exported = structuredClone(project);
    exported.nodes.forEach((node) => (node.codeNamesLocked = true));
    const result = await run(() => window.espresso.export(exported));
    if (result) {
      for (const node of exported.nodes)
        exportedNames.current.set(node.id, {
          symbol: node.symbol,
          ...(node.kind === 'struct' ? { typeName: node.typeName } : {}),
        });
      setProject(exported);
      setDirty(true);
      setExportPath(result.path);
      setExportParent('');
      notify(`Exported ${result.fileCount} files to ${result.path}`);
    }
  }
  async function chooseExportFolder() {
    if (!project) return;
    const folder = await run(() =>
      window.espresso.chooseExportFolder(project.name),
    );
    if (folder) setExportParent(folder);
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (recovery || importPicker) return;
      const form = (e.target as HTMLElement)?.closest(
        'input,textarea,select,[contenteditable=true]',
      );
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void save(e.shiftKey);
      } else if (
        !form &&
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 'z'
      ) {
        e.preventDefault();
        e.shiftKey ? redoAction() : undoAction();
      } else if (
        !form &&
        e.key === 'Delete' &&
        view === 'canvas' &&
        selectedId
      ) {
        e.preventDefault();
        removeNode(selectedId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });
  const errors =
      preview?.diagnostics.filter((d) => d.severity === 'error') ?? [],
    warnings =
      preview?.diagnostics.filter((d) => d.severity === 'warning') ?? [];
  const selectedFile =
    preview?.files[file] !== undefined
      ? file
      : (tasks
          .map((t) => `main/tasks/${t.symbol}_task.cpp`)
          .find((path) => preview?.files[path] !== undefined) ??
        Object.keys(preview?.files ?? {})[0]);

  return {
    importPicker,
    setImportPicker,
    recovery,
    resolveRecovery,
    templates,
    templateFolder,
    templateErrors,
    refreshTemplates,
    templatePicker,
    setTemplatePicker,
    templateDraft,
    setTemplateDraft,
    saveTemplate,
    deleteTemplate,
    addTemplateTask,
    newTemplate,
    project,
    registerNavigationGuard,
    projectSetup,
    setProjectSetup,
    view,
    setView,
    selectedId,
    setSelectedId,
    setStepSelection,
    showSteps,
    setShowSteps,
    preview,
    checking,
    setFile,
    message,
    error,
    setError,
    dirty,
    setDirty,
    savedPath,
    busy,
    exportPath,
    exportParent,
    chooseExportFolder,
    undo,
    setUndo,
    redo,
    setRedo,
    confirm,
    setConfirm,
    flow,
    dragHistory,
    selected,
    tasks,
    structs,
    task,
    shared,
    selectedStep,
    notify,
    run,
    change,
    updateTask,
    updateShared,
    undoAction,
    redoAction,
    save,
    replaceDocument,
    requestDocument,
    editNode,
    editStep,
    addNode,
    addTaskData,
    removeNode,
    addStep,
    changeStep,
    moveStep,
    reorder,
    connect,
    removeConnection,
    graphNodes,
    graphEdges,
    nodeChanges,
    lockedConnection: (id: string) =>
      project ? lockedConnection(project, id) : false,
    exportProject,
    errors,
    warnings,
    selectedFile,
  };
}
export type EditorController = ReturnType<typeof useEditor>;
