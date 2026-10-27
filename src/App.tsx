import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
} from '@xyflow/react';
import {
  ArrowDownToLine,
  ArrowRight,
  Braces,
  CircleAlert,
  Cpu,
  FileCode2,
  FilePlus2,
  FolderOpen,
  ListOrdered,
  Library,
  Plus,
  Redo2,
  Repeat2,
  Save,
  Trash2,
  Undo2,
  Workflow,
  X,
  Layers,
  Settings2,
  ListPlus,
} from 'lucide-react';
import { importedNode, lockedConnection } from './imported';
import type { Task } from './model';
import { nodeTypes } from './components/DiagramNode';
import { TaskSettings } from './components/TaskSettings';
import type { FlowNode } from './editor/types';
import { useEditor } from './editor/useEditor';
import { ExportScreen } from './screens/ExportScreen';
import { StructScreen } from './screens/StructScreen';
import { TaskScreen } from './screens/TaskScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { TemplateScreen } from './screens/TemplateScreen';
import { ConfigFileScreen } from './screens/ConfigFileScreen';
import { DataTypeScreen } from './screens/DataTypeScreen';
import { TaskIcon } from './components/TaskIcon';
import { TemplatePicker } from './components/TemplatePicker';

export default function App() {
  const editor = useEditor();
  const {
    project,
    view,
    setView,
    selectedId,
    setSelectedId,
    showSteps,
    setShowSteps,
    preview,
    message,
    error,
    setError,
    dirty,
    setDirty,
    savedPath,
    busy,
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
    run,
    updateTask,
    undoAction,
    redoAction,
    save,
    replaceDocument,
    requestDocument,
    editNode,
    addNode,
    removeNode,
    connect,
    removeConnection,
    graphNodes,
    graphEdges,
    nodeChanges,
  } = editor;
  if (!project)
    return (
      <main className="loading">
        <h1>ESPresso</h1>
        <p>{error || 'Opening…'}</p>
      </main>
    );
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-name">ESPresso</span>
        </div>
        <div className="project-label" title={savedPath ?? 'Unsaved layout'}>
          {!savedPath && project.name === 'untitled-project'
            ? 'New layout'
            : project.name}
          {dirty && <b aria-label="Unsaved changes">●</b>}
        </div>
        <span className="backend-label">
          <Cpu size={14} />
          {project.target
            .toUpperCase()
            .replace('ESP32S3', 'ESP32-S3')
            .replace('ESP32C3', 'ESP32-C3')}
        </span>
        <div className="header-actions">
          <button
            className="button quiet"
            disabled={busy}
            onClick={() => requestDocument('import')}
          >
            <FolderOpen size={16} />
            Import project
          </button>
          <button
            className="button quiet"
            onClick={() => requestDocument('open')}
            disabled={busy}
          >
            <FolderOpen size={16} />
            Open
          </button>
          <button
            className="button"
            onClick={() => void save()}
            disabled={busy}
          >
            <Save size={16} />
            Save layout
          </button>
          <button
            className="button primary"
            onClick={() => {
              setView('export');
            }}
          >
            <ArrowDownToLine size={16} />
            Export skeleton
          </button>
        </div>
      </header>
      <nav className="tabs" aria-label="Project screens">
        {(
          [
            { id: 'canvas', name: 'Canvas', icon: Workflow },
            { id: 'task', name: 'Task steps', icon: ListOrdered },
            { id: 'struct', name: 'Shared structs', icon: Braces },
            { id: 'libraries', name: 'Libraries', icon: Library },
            { id: 'templates', name: 'Task types', icon: Layers },
            { id: 'types', name: 'Data types', icon: Braces },
            { id: 'config', name: 'Config File', icon: Settings2 },
            { id: 'export', name: 'Export', icon: FileCode2 },
          ] as const
        ).map(({ id, name, icon: Icon }) => (
          <button
            key={id}
            className={view === id ? 'active' : ''}
            aria-selected={view === id}
            onClick={() => {
              setView(id);
              if (id === 'task' && task) setSelectedId(task.id);
              if (id === 'struct' && shared) setSelectedId(shared.id);
            }}
          >
            <Icon size={16} />
            {name}
          </button>
        ))}
        <div className="history-actions">
          <button
            className="icon-button"
            disabled={!undo.length}
            onClick={undoAction}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            <Undo2 size={17} />
          </button>
          <button
            className="icon-button"
            disabled={!redo.length}
            onClick={redoAction}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo"
          >
            <Redo2 size={17} />
          </button>
        </div>
      </nav>
      {error && (
        <div className="error-banner" role="alert">
          <CircleAlert size={17} />
          <span>{error}</span>
          <button
            className="icon-button"
            aria-label="Dismiss error"
            onClick={() => setError('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {view === 'canvas' && (
        <div className="canvas-layout">
          <aside className="project-sidebar">
            <div className="sidebar-section">
              <h3>Build your layout</h3>
              <button
                className="palette-button"
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData('application/espresso', 'task')
                }
                onClick={() => addNode('task')}
              >
                <Repeat2 size={18} />
                <span>
                  Task<small>Drag onto canvas</small>
                </span>
                <Plus size={14} />
              </button>
              <button
                className="palette-button"
                disabled={busy}
                onClick={() => {
                  editor.setTemplatePicker(true);
                  void editor.refreshTemplates();
                }}
              >
                <Layers size={18} />
                <span>
                  Task from template<small>Choose a task type</small>
                </span>
                <Plus size={14} />
              </button>
              <button
                className="palette-button teal"
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData('application/espresso', 'queue')
                }
                onClick={() => addNode('queue')}
              >
                <ListPlus size={18} />
                <span>
                  Queue<small>Typed FIFO messages</small>
                </span>
                <Plus size={14} />
              </button>
              <button
                className="palette-button teal"
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData('application/espresso', 'struct')
                }
                onClick={() => addNode('struct')}
              >
                <Braces size={18} />
                <span>
                  Shared struct<small>Drag onto canvas</small>
                </span>
                <Plus size={14} />
              </button>
            </div>
            <div className="sidebar-section">
              <h3>
                Tasks <span>{tasks.length}</span>
              </h3>
              {tasks.map((t) => (
                <button
                  className={`tree-item ${selectedId === t.id ? 'active' : ''}`}
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  onDoubleClick={() => editNode(t.id)}
                >
                  <TaskIcon icon={t.icon} size={14} />
                  {t.name || 'Unnamed task'}
                  {importedNode(project, t.id) && (
                    <small className="imported-badge">Imported</small>
                  )}
                </button>
              ))}
            </div>
            <div className="sidebar-section">
              <h3>
                Shared data <span>{structs.length}</span>
              </h3>
              {structs.map((s) => (
                <button
                  className={`tree-item teal ${selectedId === s.id ? 'active' : ''}`}
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  onDoubleClick={() => editNode(s.id)}
                >
                  <Braces size={14} />
                  {s.name || 'Unnamed struct'}
                </button>
              ))}
            </div>
            <div className="sidebar-bottom">
              <button
                className="text-button"
                onClick={() => requestDocument('new')}
              >
                <FilePlus2 size={15} />
                New layout
              </button>
              <button
                className="text-button"
                onClick={() => requestDocument('example')}
              >
                <Workflow size={15} />
                Pressure example
              </button>
            </div>
          </aside>
          <section
            className="canvas-area"
            aria-label="Draggable dataflow canvas"
          >
            <div className="canvas-toolbar">
              <div>
                <strong>Architecture</strong>
                <span>
                  {tasks.length} tasks · {structs.length} structs
                </span>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={showSteps}
                  onChange={(e) => setShowSteps(e.target.checked)}
                />
                Show steps
              </label>
            </div>
            <div
              className="flow-wrap"
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }}
              onDrop={(e) => {
                e.preventDefault();
                const kind = e.dataTransfer.getData('application/espresso');
                const templateId = e.dataTransfer.getData(
                  'application/espresso-template',
                );
                if (templateId) {
                  void editor.addTemplateTask(
                    templateId,
                    flow.current?.screenToFlowPosition({
                      x: e.clientX,
                      y: e.clientY,
                    }),
                  );
                  return;
                }
                if (kind === 'task' || kind === 'struct' || kind === 'queue')
                  addNode(
                    kind,
                    flow.current?.screenToFlowPosition({
                      x: e.clientX,
                      y: e.clientY,
                    }),
                  );
              }}
            >
              <ReactFlow<FlowNode>
                nodes={graphNodes}
                edges={graphEdges}
                nodeTypes={nodeTypes}
                onInit={(instance) => (flow.current = instance)}
                onNodesChange={nodeChanges}
                onNodeDragStart={() => {
                  if (project && !dragHistory.current) {
                    setUndo((h) => [...h.slice(-79), project]);
                    setRedo([]);
                    setDirty(true);
                    dragHistory.current = true;
                  }
                }}
                onNodeDragStop={() => {
                  dragHistory.current = false;
                }}
                onNodeClick={(_, node) => setSelectedId(node.id)}
                onPaneClick={() => setSelectedId(null)}
                onNodeDoubleClick={(_, node) => editNode(node.id)}
                onConnect={connect}
                isValidConnection={(c) => {
                  const a = project.nodes.find((n) => n.id === c.source),
                    b = project.nodes.find((n) => n.id === c.target);
                  return (
                    !!a &&
                    !!b &&
                    !(
                      c.sourceHandle?.startsWith('step:') &&
                      lockedConnection(project, c.sourceHandle.slice(5))
                    ) &&
                    !(
                      c.targetHandle?.startsWith('step:') &&
                      lockedConnection(project, c.targetHandle.slice(5))
                    ) &&
                    (a.kind !== b.kind ||
                      (a.kind === 'task' &&
                        b.kind === 'task' &&
                        b.trigger === 'notification'))
                  );
                }}
                onEdgeDoubleClick={(_, edge) => removeConnection(edge.id)}
                onEdgesDelete={(edges) =>
                  edges.forEach((e) => removeConnection(e.id))
                }
                deleteKeyCode={null}
                fitView
                fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
                minZoom={0.25}
                maxZoom={1.75}
                snapToGrid
                snapGrid={[12, 12]}
                proOptions={{ hideAttribution: true }}
              >
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={20}
                  size={1}
                />
                <Controls showInteractive={false} />
                <MiniMap
                  pannable
                  zoomable
                  nodeColor={(n) =>
                    project.nodes.find((item) => item.id === n.id)?.kind ===
                    'struct'
                      ? '#b4c2a8'
                      : '#c8aa8e'
                  }
                />
              </ReactFlow>
              {!project.nodes.length && (
                <div className="canvas-empty">
                  <Workflow size={32} />
                  <h2>Start with a task and a struct</h2>
                  <p>Drag them from the left, then connect their ports.</p>
                </div>
              )}
            </div>
            <div className="canvas-hint">
              <span>
                <i className="legend-dot" />
                Tasks & placeholders
              </span>
              <span>
                <i className="legend-dot teal" />
                Snapshots & queued messages
              </span>
              <span>
                Drag ports to connect · Double-click a new wire to remove;
                imported wires are protected
              </span>
            </div>
          </section>
          <aside className="inspector">
            <div className="inspector-heading">
              <h3>
                {selected?.kind === 'task'
                  ? 'Task settings'
                  : selected?.kind === 'struct'
                    ? 'Shared struct'
                    : 'Inspector'}
              </h3>
              {selected && (
                <button
                  className="icon-button danger"
                  aria-label="Delete selected node"
                  disabled={!!importedNode(project, selected.id)}
                  title={
                    importedNode(project, selected.id)
                      ? 'Imported items cannot be deleted.'
                      : undefined
                  }
                  onClick={() => removeNode(selected.id)}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
            {selected?.kind === 'task' ? (
              <>
                <TaskSettings
                  task={task}
                  imported={importedNode(project, task?.id) as Task | undefined}
                  updateTask={updateTask}
                  structs={structs}
                  compact
                />
                <button
                  className="button full"
                  onClick={() => editNode(selected.id)}
                >
                  <ListOrdered size={15} />
                  Edit setup & loop
                  <ArrowRight size={14} />
                </button>
                <div className="info-note">
                  Connect data to read a snapshot or receive a queued message.
                  Connect tasks to send notifications to a
                  notification-triggered task.
                </div>
              </>
            ) : selected?.kind === 'struct' ? (
              <>
                <div className="struct-summary">
                  <Braces size={24} />
                  <h2>{selected.typeName || 'Unnamed'}</h2>
                  <code>shared::{selected.symbol}</code>
                  <p>
                    {selected.fields.length} fields ·{' '}
                    {selected.delivery === 'mailbox'
                      ? '1 value · overwrite unread'
                      : selected.delivery === 'queue'
                        ? `${selected.capacity ?? 8} messages`
                        : 'mutex protected'}
                  </p>
                </div>
                <button
                  className="button full"
                  onClick={() => editNode(selected.id)}
                >
                  Edit fields & connections
                  <ArrowRight size={14} />
                </button>
                <div className="info-note">
                  {selected.delivery === 'mailbox'
                    ? 'A mailbox stores the latest unread value. A send replaces an older value; a receive consumes it.'
                    : selected.delivery === 'queue'
                      ? 'A queue stores FIFO messages. Each receive removes one message.'
                      : 'A struct stores the latest complete snapshot. Each read or publish holds its mutex only while copying.'}
                </div>
              </>
            ) : (
              <div className="info-note">
                Select a task or shared struct to inspect it.
                <br />
                <br />
                Task output → struct: publish.
                <br />
                Struct output → task: read.
                <br />
                <br />
                Connections add access steps to the task’s loop.
              </div>
            )}
            {preview &&
              project.nodes.length > 0 &&
              preview.diagnostics.length > 0 && (
                <div className="inspector-issues">
                  <h3>Layout checks</h3>
                  {preview.diagnostics
                    .filter(
                      (d) =>
                        !selectedId || d.nodeId === selectedId || !d.nodeId,
                    )
                    .slice(0, 5)
                    .map((d, i) => (
                      <p key={i} className={d.severity}>
                        <CircleAlert size={13} />
                        {d.message}
                      </p>
                    ))}
                </div>
              )}
          </aside>
        </div>
      )}
      {view === 'task' && <TaskScreen {...editor} />}
      {view === 'struct' && <StructScreen {...editor} />}
      {view === 'libraries' && <LibraryScreen {...editor} />}
      {view === 'templates' && <TemplateScreen {...editor} />}
      {view === 'config' && <ConfigFileScreen {...editor} />}
      {view === 'types' && <DataTypeScreen {...editor} />}
      {view === 'export' && <ExportScreen {...editor} />}
      {message && (
        <div className="action-toast" role="status" aria-live="polite">
          {message}
        </div>
      )}
      {editor.templatePicker && <TemplatePicker {...editor} />}
      {confirm && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="replace-title"
          >
            <h2 id="replace-title">Save this layout first?</h2>
            <p>You have changes that haven’t been saved to a layout file.</p>
            <div className="actions">
              <button className="button" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                className="button"
                onClick={() => void replaceDocument(confirm)}
              >
                Continue without saving
              </button>
              <button
                className="button primary"
                onClick={() => {
                  void run(async () => {
                    const r = await window.espresso.save(project);
                    if (r) await replaceDocument(confirm);
                  });
                }}
              >
                Save & continue
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
