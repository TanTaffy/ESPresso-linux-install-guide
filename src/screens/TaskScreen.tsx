import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Download,
  GripVertical,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import { Empty } from '../components/Empty';
import { FieldLabel } from '../components/FieldLabel';
import { TaskSettings } from '../components/TaskSettings';
import type { EditorController } from '../editor/useEditor';
import type { Phase, Step } from '../model';

type Props = Pick<
  EditorController,
  | 'setView'
  | 'setSelectedId'
  | 'setStepSelection'
  | 'tasks'
  | 'structs'
  | 'task'
  | 'selectedStep'
  | 'updateTask'
  | 'addNode'
  | 'addStep'
  | 'changeStep'
  | 'moveStep'
  | 'reorder'
>;
export function TaskScreen({
  setView,
  setSelectedId,
  setStepSelection,
  tasks,
  structs,
  task,
  selectedStep,
  updateTask,
  addNode,
  addStep,
  changeStep,
  moveStep,
  reorder,
}: Props) {
  return task ? (
    <>
      <div className="page-heading">
        <div>
          <h1>{task.name} task</h1>
          <p>Setup runs once. Loop repeats at the task period.</p>
        </div>
        <div className="actions">
          <select
            aria-label="Select task"
            value={task.id}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setStepSelection(null);
            }}
          >
            {tasks.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name} task
              </option>
            ))}
          </select>
          <button className="button" onClick={() => setView('canvas')}>
            <ArrowLeft size={15} />
            Canvas
          </button>
        </div>
      </div>
      <div className="task-layout">
        <aside className="task-settings">
          <h3>Task settings</h3>
          <TaskSettings task={task} updateTask={updateTask} />
        </aside>
        <main className="steps-editor">
          {(['setup', 'loop'] as Phase[]).map((phase) => (
            <section className="step-group" key={phase}>
              <div className="section-title">
                <h2>{phase}()</h2>
                <span>
                  {phase === 'setup'
                    ? 'Run once'
                    : `Repeat every ${task.periodMs} ms`}
                </span>
              </div>
              {task[phase].map((s, i) => (
                <div
                  className="edit-step-row"
                  key={s.id}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData(
                      'application/taskflow-step',
                      JSON.stringify({ phase, id: s.id }),
                    )
                  }
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    try {
                      const from = JSON.parse(
                        e.dataTransfer.getData('application/taskflow-step'),
                      );
                      if (from.phase === phase) reorder(phase, from.id, s.id);
                    } catch {}
                  }}
                >
                  <GripVertical size={15} className="grip" />
                  <button
                    className={`edit-step ${selectedStep?.id === s.id ? 'selected' : ''}`}
                    onClick={() => setStepSelection({ phase, id: s.id })}
                  >
                    <span className="step-number">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <strong>{s.name || 'Unnamed step'}</strong>
                      <small>
                        {s.kind === 'placeholder'
                          ? 'Code placeholder'
                          : `${s.kind === 'read' ? 'Read' : 'Publish'} shared snapshot`}
                      </small>
                    </div>
                    {s.kind !== 'placeholder' && (
                      <span className="access-badge">{s.kind}</span>
                    )}
                  </button>
                  <div className="step-row-tools">
                    <button
                      className="icon-button"
                      disabled={i === 0}
                      aria-label={`Move ${s.name} up`}
                      onClick={() => moveStep(phase, s.id, -1)}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={i === task[phase].length - 1}
                      aria-label={`Move ${s.name} down`}
                      onClick={() => moveStep(phase, s.id, 1)}
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={`Delete step ${s.name}`}
                      onClick={() => {
                        updateTask(
                          (t) =>
                            (t[phase] = t[phase].filter((x) => x.id !== s.id)),
                        );
                        if (selectedStep?.id === s.id) setStepSelection(null);
                      }}
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>
              ))}
              <div className="add-step-row">
                <button
                  className="button dashed"
                  onClick={() => addStep(phase)}
                >
                  <Plus size={15} />
                  Placeholder
                </button>
                <button
                  className="button dashed"
                  onClick={() => addStep(phase, 'read')}
                >
                  <Download size={14} />
                  Read struct
                </button>
                <button
                  className="button dashed"
                  onClick={() => addStep(phase, 'write')}
                >
                  <Upload size={14} />
                  Publish
                </button>
              </div>
            </section>
          ))}
        </main>
        <aside className="inspector step-inspector">
          <h3>Selected step</h3>
          {selectedStep ? (
            <>
              <FieldLabel label="Step name">
                <input
                  aria-label="Step name"
                  value={selectedStep.name}
                  onChange={(e) => changeStep((s) => (s.name = e.target.value))}
                />
              </FieldLabel>
              <FieldLabel label="Step type">
                <select
                  aria-label="Step type"
                  value={selectedStep.kind}
                  onChange={(e) =>
                    changeStep((s) => {
                      s.kind = e.target.value as Step['kind'];
                      if (s.kind !== 'placeholder') {
                        delete s.action;
                        s.structId = s.structId ?? structs[0]?.id ?? '';
                        s.localName =
                          s.localName ?? structs[0]?.symbol ?? 'snapshot';
                      } else {
                        delete s.structId;
                        delete s.localName;
                      }
                    })
                  }
                >
                  <option value="placeholder">Placeholder</option>
                  <option value="read">Read shared struct</option>
                  <option value="write">Publish shared struct</option>
                </select>
              </FieldLabel>
              {selectedStep.kind === 'placeholder' ? (
                <>
                  <FieldLabel label="Implementation note">
                    <textarea
                      aria-label="Implementation note"
                      rows={6}
                      value={selectedStep.note}
                      onChange={(e) =>
                        changeStep((s) => (s.note = e.target.value))
                      }
                    />
                  </FieldLabel>
                  <div className="info-note">
                    The name and note become TODO comments in the generated
                    function. Write the implementation in your usual editor.
                  </div>
                </>
              ) : (
                <>
                  <FieldLabel label="Shared struct">
                    <select
                      aria-label="Connected struct"
                      value={selectedStep.structId ?? ''}
                      onChange={(e) =>
                        changeStep((s) => {
                          s.structId = e.target.value;
                          s.localName =
                            structs.find((x) => x.id === e.target.value)
                              ?.symbol ?? 'snapshot';
                        })
                      }
                    >
                      <option value="">Select a struct…</option>
                      {structs.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.typeName})
                        </option>
                      ))}
                    </select>
                  </FieldLabel>
                  <FieldLabel label="Local snapshot name">
                    <input
                      className="mono"
                      aria-label="Local snapshot name"
                      value={selectedStep.localName ?? ''}
                      onChange={(e) =>
                        changeStep((s) => (s.localName = e.target.value))
                      }
                    />
                  </FieldLabel>
                  <div className="info-note">
                    {selectedStep.kind === 'read'
                      ? 'Copies shared data into a local snapshot.'
                      : 'Publishes the complete local snapshot.'}{' '}
                    The generated helper handles the mutex.
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="info-note">
              Select a step to edit its name, type and implementation note. Drag
              the grip or use the arrows to reorder.
            </div>
          )}
        </aside>
      </div>
    </>
  ) : (
    <Empty title="No tasks yet">
      <button className="button primary" onClick={() => addNode('task')}>
        <Plus size={16} />
        Add a task
      </button>
    </Empty>
  );
}
