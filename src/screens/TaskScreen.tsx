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
  | 'project'
  | 'preview'
  | 'newTemplate'
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
  project,
  preview,
  newTemplate,
}: Props) {
  return task ? (
    <>
      <div className="page-heading">
        <div>
          <h1>{task.name} task</h1>
          <p>
            Setup runs once.{' '}
            {task.trigger === 'queues'
              ? 'Loop receives a typed event from any selected input.'
              : task.trigger === 'queue'
                ? 'Loop receives one message as event.'
                : task.trigger === 'notification'
                  ? 'Each notification runs the loop once.'
                  : 'Loop repeats at the task period.'}
          </p>
        </div>
        <div className="actions">
          <button className="button" onClick={() => newTemplate(task)}>
            Save as task type
          </button>
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
          <TaskSettings task={task} updateTask={updateTask} structs={structs} />
          <h3>Libraries</h3>
          {!project?.libraries?.length && (
            <p className="info-note">Add libraries on the Libraries screen.</p>
          )}
          {project?.libraries?.map((lib) => {
            return (
              <label className="library-assignment" key={lib.id}>
                <input
                  type="checkbox"
                  aria-label={`Give ${task.name} access to ${lib.name}`}
                  checked={(task.libraryIds ?? []).includes(lib.id)}
                  onChange={(e) =>
                    updateTask((t) => {
                      t.libraryIds = e.target.checked
                        ? [...(t.libraryIds ?? []), lib.id]
                        : (t.libraryIds ?? []).filter((id) => id !== lib.id);
                    })
                  }
                />
                {lib.name}
              </label>
            );
          })}
        </aside>
        <main className="steps-editor">
          {(['setup', 'loop'] as Phase[]).map((phase) => (
            <section className="step-group" key={phase}>
              <div className="section-title">
                <h2>{phase}()</h2>
                <span>
                  {phase === 'setup'
                    ? 'Run once'
                    : task.trigger === 'queue'
                      ? 'On queue message · event'
                      : task.trigger === 'notification'
                        ? 'On notification'
                        : `Repeat every ${task.periodExpression || task.periodMs} ms`}
                </span>
              </div>
              {task[phase].map((s, i) => (
                <div
                  className="edit-step-row"
                  key={s.id}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData(
                      'application/espresso-step',
                      JSON.stringify({ phase, id: s.id }),
                    )
                  }
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    try {
                      const from = JSON.parse(
                        e.dataTransfer.getData('application/espresso-step'),
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
                          ? preview?.stepStates?.[s.id] === 'Code present'
                            ? 'Code placeholder · Code present'
                            : 'Code placeholder · Empty'
                          : s.kind === 'notify'
                            ? 'Notify task'
                            : s.kind === 'send' || s.kind === 'receive'
                              ? `${s.kind} queue message`
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
                <button
                  className="button dashed"
                  onClick={() => addStep(phase, 'send')}
                >
                  Send queue
                </button>
                <button
                  className="button dashed"
                  onClick={() => addStep(phase, 'receive')}
                >
                  Receive queue
                </button>
                <button
                  className="button dashed"
                  onClick={() => addStep(phase, 'notify')}
                >
                  Notify task
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
                      if (s.kind === 'notify') {
                        delete s.structId;
                        delete s.localName;
                        s.taskId =
                          tasks.find((t) => t.trigger === 'notification')?.id ??
                          '';
                      } else if (s.kind !== 'placeholder') {
                        delete s.taskId;
                        const data = structs.find(
                          (d) =>
                            (d.delivery === 'queue' ||
                              d.delivery === 'mailbox') ===
                            (s.kind === 'send' || s.kind === 'receive'),
                        );
                        s.structId = data?.id ?? '';
                        s.localName = data?.symbol ?? 'message';
                        s.timeoutMs ??= 0;
                        s.onFailure ??= 'return';
                      } else {
                        delete s.structId;
                        delete s.localName;
                        delete s.taskId;
                      }
                    })
                  }
                >
                  <option value="placeholder">Placeholder</option>
                  <option value="read">Read shared struct</option>
                  <option value="write">Publish shared struct</option>
                  <option value="send">Send queue message</option>
                  <option value="receive">Receive queue message</option>
                  <option value="notify">Notify task</option>
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
                  {preview?.stepCode?.[selectedStep.id] && (
                    <details className="imported-code">
                      <summary>
                        Preserved code · {preview.stepStates?.[selectedStep.id]}
                      </summary>
                      <pre>{preview.stepCode[selectedStep.id]}</pre>
                      <p>
                        Read-only snapshot. Re-import the project after editing
                        its source files.
                      </p>
                    </details>
                  )}
                </>
              ) : selectedStep.kind === 'notify' ? (
                <FieldLabel label="Notification target">
                  <select
                    aria-label="Notification target"
                    value={selectedStep.taskId ?? ''}
                    onChange={(e) =>
                      changeStep((s) => {
                        s.taskId = e.target.value;
                      })
                    }
                  >
                    <option value="">
                      Select a notification-triggered task…
                    </option>
                    {tasks
                      .filter((t) => t.trigger === 'notification')
                      .map((t) => (
                        <option value={t.id} key={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </FieldLabel>
              ) : (
                <>
                  <FieldLabel
                    label={
                      selectedStep.kind === 'send' ||
                      selectedStep.kind === 'receive'
                        ? 'Queue'
                        : 'Shared struct'
                    }
                  >
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
                      {structs
                        .filter(
                          (s) =>
                            (s.delivery === 'queue' ||
                              s.delivery === 'mailbox') ===
                            (selectedStep.kind === 'send' ||
                              selectedStep.kind === 'receive'),
                        )
                        .map((s) => (
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
                  {(selectedStep.kind === 'send' ||
                    selectedStep.kind === 'receive') && (
                    <>
                      <FieldLabel
                        label="Timeout (ms)"
                        hint={
                          selectedStep.kind === 'send' &&
                          structs.find((s) => s.id === selectedStep.structId)
                            ?.delivery === 'mailbox'
                            ? 'Mailbox sends replace the unread value without blocking.'
                            : '0: no wait. -1: wait forever.'
                        }
                      >
                        <input
                          aria-label="Queue timeout"
                          disabled={
                            !!selectedStep.timeoutExpression ||
                            (selectedStep.kind === 'send' &&
                              structs.find(
                                (s) => s.id === selectedStep.structId,
                              )?.delivery === 'mailbox')
                          }
                          type="number"
                          min={-1}
                          max={3600000}
                          value={
                            selectedStep.timeoutExpression
                              ? ''
                              : (selectedStep.timeoutMs ?? 0)
                          }
                          placeholder={
                            selectedStep.timeoutExpression
                              ? 'Expression'
                              : undefined
                          }
                          onChange={(e) =>
                            changeStep((s) => {
                              s.timeoutMs = Number(e.target.value);
                            })
                          }
                        />
                      </FieldLabel>
                      {selectedStep.timeoutExpression !== undefined && (
                        <FieldLabel label="Timeout expression">
                          <input
                            aria-label="Timeout expression"
                            className="mono"
                            value={selectedStep.timeoutExpression}
                            onChange={(e) =>
                              changeStep((s) => {
                                s.timeoutExpression =
                                  e.target.value || undefined;
                              })
                            }
                          />
                        </FieldLabel>
                      )}
                      <FieldLabel
                        label={
                          selectedStep.kind === 'send'
                            ? 'When full / timeout'
                            : 'When empty / timeout'
                        }
                      >
                        <select
                          aria-label="Queue failure behaviour"
                          value={selectedStep.onFailure ?? 'return'}
                          onChange={(e) =>
                            changeStep((s) => {
                              s.onFailure = e.target.value as Step['onFailure'];
                            })
                          }
                        >
                          <option value="return">Skip remaining steps</option>
                          <option value="continue">
                            {selectedStep.kind === 'send'
                              ? 'Drop message and continue'
                              : 'Keep local value and continue'}
                          </option>
                          <option value="assert">Assert success</option>
                        </select>
                      </FieldLabel>
                    </>
                  )}
                  <div className="info-note">
                    {selectedStep.kind === 'send' ||
                    selectedStep.kind === 'receive'
                      ? structs.find((s) => s.id === selectedStep.structId)
                          ?.delivery === 'mailbox'
                        ? 'Mailbox: sending replaces the unread value; receiving consumes it.'
                        : 'FIFO queue: each message is consumed once. A queue-triggered task already receives its trigger message as event.'
                      : selectedStep.kind === 'read'
                        ? 'Copies shared data into a local snapshot.'
                        : 'Publishes the complete local snapshot. The generated helper handles the mutex.'}
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
