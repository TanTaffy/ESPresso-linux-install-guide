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
} from '../model';
import type { FlowNode, StepSelection, View } from './types';

export function useEditor() {
  const [project, setProject] = useState<Project | null>(null),
    [view, setView] = useState<View>('canvas');
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
  const [exportCanVersion, setExportCanVersion] = useState('');
  const [undo, setUndo] = useState<Project[]>([]),
    [redo, setRedo] = useState<Project[]>([]),
    [confirm, setConfirm] = useState<null | 'new' | 'example' | 'open'>(null);
  const flow = useRef<ReactFlowInstance<FlowNode> | null>(null),
    dragHistory = useRef(false);
  const fitPending = useRef(false);
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
    setUndo((h) => [...h.slice(-79), project]);
    setRedo([]);
    setProject(next);
    setDirty(true);
  }
  function updateNode(id: string, edit: (node: LayoutNode) => void) {
    change((p) => {
      const n = p.nodes.find((n) => n.id === id);
      if (n) edit(n);
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
    setProject(undo.at(-1)!);
    setUndo((h) => h.slice(0, -1));
    setDirty(true);
  }
  function redoAction() {
    if (!project || !redo.length) return;
    setUndo((h) => [...h, project]);
    setProject(redo.at(-1)!);
    setRedo((h) => h.slice(0, -1));
    setDirty(true);
  }
  async function save(saveAs = false) {
    if (!project) return;
    const result = await run(() => window.espresso.save(project, saveAs));
    if (result) {
      setSavedPath(result.path);
      setDirty(false);
      notify('Layout saved');
    }
  }
  async function replaceDocument(action: 'new' | 'example' | 'open') {
    await run(async () => {
      if (action === 'open') {
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
        setSavedPath(null);
        setSelectedId(p.nodes[0]?.id ?? null);
        notify(action === 'new' ? 'New layout' : 'Pressure example loaded');
      }
      setUndo([]);
      fitPending.current = true;
      setFitRevision((value) => value + 1);
      setRedo([]);
      setDirty(false);
      setStepSelection(null);
      setView('canvas');
      setExportPath('');
    });
    setConfirm(null);
  }
  function requestDocument(action: 'new' | 'example' | 'open') {
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
    kind: 'task' | 'struct',
    position?: { x: number; y: number },
  ) {
    const { i, symbol } = uniqueSymbol(kind);
    const id = uid();
    const pos = position ??
      flow.current?.screenToFlowPosition({
        x: window.innerWidth * 0.43,
        y: window.innerHeight * 0.4,
      }) ?? { x: 80, y: 80 };
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
            kind,
            name: `Shared data ${i}`,
            symbol,
            typeName: `SharedData${i}`,
            position: pos,
            fields: [],
          };
    change((p) => p.nodes.push(node));
    setSelectedId(id);
    setStepSelection(null);
    setView('canvas');
    notify(`${kind === 'task' ? 'Task' : 'Shared struct'} added`);
  }
  async function addCanTask(position?: { x: number; y: number }) {
    if (!project) return;
    const base = project;
    const pos = position ??
      flow.current?.screenToFlowPosition({
        x: window.innerWidth * 0.43,
        y: window.innerHeight * 0.4,
      }) ?? { x: 80, y: 80 };
    const node = await run(() => window.espresso.canPreset(base, pos));
    if (!node) return;
    change((p) => p.nodes.push(node));
    setSelectedId(node.id);
    setStepSelection(null);
    setView('canvas');
    notify('CAN task added');
  }
  function removeNode(id: string) {
    const n = project?.nodes.find((n) => n.id === id);
    if (!n) return;
    change((p) => {
      p.nodes = p.nodes.filter((n) => n.id !== id);
      for (const t of p.nodes)
        if (t.kind === 'task')
          for (const phase of ['setup', 'loop'] as Phase[])
            t[phase] = t[phase].filter(
              (s) => s.kind === 'placeholder' || s.structId !== id,
            );
    });
    setSelectedId(null);
    setStepSelection(null);
    notify(`${n.name} deleted. Undo is available.`);
  }
  function addStep(phase: Phase, kind: Step['kind'] = 'placeholder') {
    const id = uid();
    const s: Step = {
      id,
      kind,
      name:
        kind === 'placeholder'
          ? 'New placeholder'
          : kind === 'read'
            ? 'Read shared data'
            : 'Publish shared data',
      note: '',
      ...(kind !== 'placeholder'
        ? {
            structId: structs[0]?.id ?? '',
            localName: structs[0]?.symbol ?? 'snapshot',
          }
        : {}),
    };
    updateTask((t) => t[phase].push(s));
    setStepSelection({ phase, id });
  }
  function changeStep(edit: (s: Step) => void) {
    if (!stepSelection) return;
    updateTask((t) => {
      const s = t[stepSelection.phase].find((s) => s.id === stepSelection.id);
      if (s) edit(s);
    });
  }
  function moveStep(phase: Phase, id: string, offset: number) {
    updateTask((t) => {
      const list = t[phase],
        i = list.findIndex((s) => s.id === id),
        j = i + offset;
      if (i >= 0 && j >= 0 && j < list.length)
        [list[i], list[j]] = [list[j], list[i]];
    });
  }
  function reorder(phase: Phase, from: string, to: string) {
    updateTask((t) => {
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
    if (!source || !target || source.kind === target.kind) return;
    const t = source.kind === 'task' ? source : (target as Task),
      s = source.kind === 'struct' ? source : (target as SharedStruct),
      kind = source.kind === 'task' ? 'write' : 'read',
      handle = kind === 'write' ? c.sourceHandle : c.targetHandle;
    const existing = handle?.startsWith('step:') ? handle.slice(5) : null;
    if (existing) {
      updateNode(t.id, (n) => {
        if (n.kind === 'task')
          for (const phase of ['setup', 'loop'] as Phase[]) {
            const step = n[phase].find((st) => st.id === existing);
            if (step) {
              step.structId = s.id;
              step.localName = s.symbol;
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
      name: `${kind === 'write' ? 'Publish' : 'Read'} ${s.name.toLowerCase()}`,
      note: '',
      structId: s.id,
      localName: s.symbol,
    };
    updateNode(t.id, (n) => {
      if (n.kind === 'task') {
        if (kind === 'read') n.loop.unshift(step);
        else n.loop.push(step);
      }
    });
    setSelectedId(t.id);
    notify(
      `${kind === 'write' ? 'Publish' : 'Read'} step added to ${t.name}.loop()`,
    );
  }
  function removeConnection(stepId: string) {
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
        data: { node: n, showSteps, edit: editNode, step: editStep },
      })) ?? [],
    [project, selectedId, showSteps, nodeDimensions],
  );
  const graphEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    for (const t of tasks)
      for (const phase of ['setup', 'loop'] as Phase[])
        for (const s of t[phase]) {
          if (
            s.kind === 'placeholder' ||
            !structs.some((n) => n.id === s.structId)
          )
            continue;
          edges.push({
            id: s.id,
            source: s.kind === 'write' ? t.id : s.structId!,
            target: s.kind === 'write' ? s.structId! : t.id,
            sourceHandle:
              s.kind === 'write'
                ? showSteps
                  ? `step:${s.id}`
                  : 'write-new'
                : 'read',
            targetHandle:
              s.kind === 'read'
                ? showSteps
                  ? `step:${s.id}`
                  : 'read-new'
                : 'write',
            type: 'smoothstep',
            label: s.kind,
            style: { stroke: '#698062', strokeWidth: 1.8 },
            labelStyle: { fill: '#55734e', fontSize: 11 },
            labelBgStyle: { fill: '#f8f3eb' },
            interactionWidth: 22,
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
    const result = await run(() => window.espresso.export(project));
    if (result) {
      setExportPath(result.path);
      setExportCanVersion(result.msmCanVersion ?? '');
      notify(`Exported ${result.fileCount} files to ${result.path}`);
    }
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
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
      : Object.keys(preview?.files ?? {})[0];

  return {
    project,
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
    exportCanVersion,
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
    addCanTask,
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
    exportProject,
    errors,
    warnings,
    selectedFile,
  };
}
export type EditorController = ReturnType<typeof useEditor>;
