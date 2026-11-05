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
import { importedNode, importedStep } from '../imported';
import type { Phase, Step, Task } from '../model';

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
  | 'addTaskData'
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
  addTaskData,
  addStep,
  changeStep,
  moveStep,
  reorder,
  project,
  preview,
  newTemplate,
}: Props) {
  const importedFile = Object.entries(project?.sourceFiles ?? {}).find(
    ([name, file]) => file.taskId === task?.id && name.endsWith('_task.cpp'),
  );
  const baseline = importedNode(project, task?.id) as Task | undefined;
  const stepLocked = !!(
    task &&
    selectedStep &&
    importedStep(project, task.id, selectedStep.id)
  );
  const hasSnapshots = structs.some(
    (s) => !s.delivery || s.delivery === 'snapshot',
  );
  const hasMessages = structs.some(
    (s) => s.delivery === 'queue' || s.delivery === 'mailbox',
  );
  const hasNotificationTargets = tasks.some(
    (t) => t.trigger === 'notification',
  );
  function displayedSteps(phase: Phase) {
    if (!task) return [];
    const items = task[phase];
    if (!baseline || phase !== 'loop') return items;
    const added = (step: Step) =>
      !!step.placement && !importedStep(project, task.id, step.id);
    return [
      ...items.filter((s) => added(s) && s.placement === 'start'),
      ...items.filter((s) => !added(s)),
      ...items.filter((s) => added(s) && s.placement === 'end'),
    ];
  }
  function canMove(phase: Phase, step: Step, offset: number) {
    if (!task) return false;
    const group = baseline
      ? task[phase].filter(
          (s) =>
            s.placement === step.placement &&
            !!s.placement &&
            !importedStep(project, task.id, s.id),
        )
      : task[phase];
    const i = group.findIndex((s) => s.id === step.id);
    return i >= 0 && i + offset >= 0 && i + offset < group.length;
  }
  return task ? (
    <>
      <div className="page-heading">
        <div>
          <h1>
            {task.name} task{' '}
            {baseline && (
              <span className="imported-badge">
                Imported · Limited functionality
              </span>
            )}
          </h1>
          <p>
            Setup runs once.{' '}
            {task.trigger === 'queues'
              ? 'Loop receives a typed event from any selected input.'
              : task.trigger === 'queue'
                ? 'Each arrival supplies a sample named event; use it directly in your implementation.'
                : task.trigger === 'notification'
                  ? 'Each notification runs the loop once.'
                  : 'Loop repeats at the task period.'}
          </p>
        </div>
        <div className="actions">
          <button className="button" onClick={() => addTaskData('input')}>
            Add incoming data
          </button>
          <button className="button" onClick={() => addTaskData('output')}>
            Add output data
          </button>
          <button
            className="button"
            onClick={() => newTemplate(task)}
            title={
              importedFile
                ? 'Saves the task layout and template base code. Imported source stays with this project.'
                : undefined
            }
          >
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
          <TaskSettings
            task={task}
            updateTask={updateTask}
            structs={structs}
            imported={baseline}
          />
          <h3>Libraries</h3>
          {baseline && (
            <p className="info-note">
              New assignments add headers and build dependencies. Initialise and
              use the library in your task implementation.
            </p>
          )}
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
                  disabled={baseline?.libraryIds?.includes(lib.id)}
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
          {importedFile && (
            <div className="info-note">
              <strong>Imported task files are preserved.</strong>
              <p>
                Add connectors at the start or end of loop(). Existing code and
                triggers stay protected. End connectors are skipped by an early
                return. Implement how inputs are used and populate outgoing
                values in your editor.
              </p>
              <details className="imported-code">
                <summary>Preserved task file · {importedFile[0]}</summary>
                <pre>{importedFile[1].content}</pre>
              </details>
            </div>
          )}
          {(['setup', 'loop'] as Phase[]).map((phase) => (
            <section className="step-group" key={phase}>
              <div className="section-title">
                <h2>{phase}()</h2>
                <span>
                  {phase === 'setup'
                    ? 'Run once'
                    : task.trigger === 'queue'
                      ? `When ${structs.find((s) => s.id === task.queueId)?.name ?? 'data'} arrives · event`
                      : task.trigger === 'queues'
                        ? 'When any selected input arrives · event'
                        : task.trigger === 'notification'
                          ? 'On notification'
                          : `Repeat every ${task.periodExpression || task.periodMs} ms`}
                </span>
              </div>
              {displayedSteps(phase).map((s, i) => (
                <div
                  className="edit-step-row"
                  key={s.id}
                  draggable={
                    !baseline ||
                    (!!s.placement && !importedStep(project, task.id, s.id))
                  }
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
                          ? importedFile
                            ? 'Code placeholder'
                            : preview?.stepStates?.[s.id] === 'Code present'
                              ? 'Code placeholder · Base code'
                              : 'Code placeholder · Empty'
                          : s.kind === 'notify'
                            ? 'Notify task'
                            : s.kind === 'send' || s.kind === 'receive'
                              ? `${s.kind} queue message`
                              : `${s.kind === 'read' ? 'Read' : 'Publish'} shared snapshot`}
                      </small>
                    </div>
                    {s.requiresCode && (
                      <span className="pending-badge">
                        Requires code update
                      </span>
                    )}
                    {s.placement && !importedStep(project, task.id, s.id) && (
                      <span className="placement-badge">
                        {s.placement === 'start' ? 'Loop start' : 'Loop end'}
                      </span>
                    )}
                    {s.kind !== 'placeholder' && (
                      <span className="access-badge">{s.kind}</span>
                    )}
                  </button>
                  <div className="step-row-tools">
                    <button
                      className="icon-button"
                      disabled={!canMove(phase, s, -1)}
                      aria-label={`Move ${s.name} up`}
                      onClick={() => moveStep(phase, s.id, -1)}
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      className="icon-button"
                      disabled={!canMove(phase, s, 1)}
                      aria-label={`Move ${s.name} down`}
                      onClick={() => moveStep(phase, s.id, 1)}
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={`Delete step ${s.name}`}
                      disabled={importedStep(project, task.id, s.id)}
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
              {!(baseline && phase === 'setup') && (
                <div className="add-step-row">
                  <button
                    className="button dashed"
                    disabled={!!baseline}
                    title={
                      baseline
                        ? 'Imported task flow is read-only; add input/output connectors instead.'
                        : undefined
                    }
                    onClick={() => addStep(phase)}
                  >
                    <Plus size={15} />
                    Placeholder
                  </button>
                  <span
                    className="step-action-hint"
                    title={
                      !hasSnapshots ? 'Add latest-value data first.' : undefined
                    }
                    tabIndex={!hasSnapshots ? 0 : undefined}
                  >
                    <button
                      className="button dashed"
                      disabled={!hasSnapshots}
                      onClick={() => addStep(phase, 'read')}
                    >
                      <Download size={14} />
                      Read latest value
                    </button>
                  </span>
                  <span
                    className="step-action-hint"
                    title={
                      !hasSnapshots ? 'Add latest-value data first.' : undefined
                    }
                    tabIndex={!hasSnapshots ? 0 : undefined}
                  >
                    <button
                      className="button dashed"
                      disabled={!hasSnapshots}
                      onClick={() => addStep(phase, 'write')}
                    >
                      <Upload size={14} />
                      Publish
                    </button>
                  </span>
                  <span
                    className="step-action-hint"
                    title={!hasMessages ? 'Add message data first.' : undefined}
                    tabIndex={!hasMessages ? 0 : undefined}
                  >
                    <button
                      className="button dashed"
                      disabled={!hasMessages}
                      onClick={() => addStep(phase, 'send')}
                    >
                      Send data
                    </button>
                  </span>
                  <span
                    className="step-action-hint"
                    title={!hasMessages ? 'Add message data first.' : undefined}
                    tabIndex={!hasMessages ? 0 : undefined}
                  >
                    <button
                      className="button dashed"
                      disabled={!hasMessages}
                      onClick={() => addStep(phase, 'receive')}
                    >
                      {phase === 'loop' &&
                      (task.trigger === 'queue' || task.trigger === 'queues')
                        ? 'Receive an additional sample'
                        : 'Receive data'}
                    </button>
                  </span>
                  <span
                    className="step-action-hint"
                    title={
                      !hasNotificationTargets
                        ? 'Set a task to When notified first.'
                        : undefined
                    }
                    tabIndex={!hasNotificationTargets ? 0 : undefined}
                  >
                    <button
                      className="button dashed"
                      disabled={!hasNotificationTargets}
                      onClick={() => addStep(phase, 'notify')}
                    >
                      Notify task
                    </button>
                  </span>
                </div>
              )}
            </section>
          ))}
        </main>
        <aside className="inspector step-inspector">
          <h3>Selected step</h3>
          {selectedStep ? (
            <>
              {stepLocked && (
                <p className="info-note">
                  Imported step · Read-only. Queue timeout values still update
                  through the Config File.
                </p>
              )}
              {baseline && selectedStep.placement && !stepLocked && (
                <div className="connection-placement">
                  <FieldLabel label="Connector placement">
                    <select
                      aria-label="Connector placement"
                      value={selectedStep.placement}
                      onChange={(e) =>
                        changeStep((s) => {
                          s.placement = e.target.value as 'start' | 'end';
                        })
                      }
                    >
                      <option value="start">Start of loop()</option>
                      <option value="end">End of loop()</option>
                    </select>
                  </FieldLabel>
                  <p className="info-note">
                    Added automatically on export.{' '}
                    {selectedStep.kind === 'send' ||
                    selectedStep.kind === 'write'
                      ? 'Outgoing values start at their defaults; populate them in the exported task file.'
                      : 'Use the local sample in your task implementation.'}
                  </p>
                </div>
              )}
              {baseline &&
                !selectedStep.placement &&
                selectedStep.kind !== 'placeholder' &&
                (selectedStep.requiresCode ||
                  preview?.connectionCode?.[selectedStep.id]) && (
                  <div className="connection-guide">
                    <strong>Requires code update</strong>
                    <p>
                      Add the include and call in your task source. Adjust the
                      sample to your implementation.
                    </p>
                    <pre>
                      {preview?.connectionCode?.[selectedStep.id] ??
                        'Choose a valid connection to see the required code.'}
                    </pre>
                    <button
                      className="button"
                      onClick={() =>
                        changeStep((s) => {
                          s.requiresCode = false;
                        })
                      }
                    >
                      Mark code updated
                    </button>
                    <p className="muted">
                      Records your confirmation; ESPresso does not inspect the
                      C++ implementation.
                    </p>
                  </div>
                )}

              {selectedStep.kind === 'placeholder' ? (
                <>
                  {' '}
                  <FieldLabel label="Step name">
                    <input
                      aria-label="Step name"
                      disabled={stepLocked}
                      value={selectedStep.name}
                      onChange={(e) =>
                        changeStep((s) => (s.name = e.target.value))
                      }
                    />
                  </FieldLabel>
                </>
              ) : (
                <details className="advanced-settings">
                  <summary>Custom step name</summary>{' '}
                  <FieldLabel label="Step name">
                    <input
                      aria-label="Step name"
                      disabled={stepLocked}
                      value={selectedStep.name}
                      onChange={(e) =>
                        changeStep((s) => (s.name = e.target.value))
                      }
                    />
                  </FieldLabel>
                </details>
              )}
              {selectedStep.kind === 'receive' &&
                (task.trigger === 'queue' || task.trigger === 'queues') && (
                  <p className="info-note">
                    This takes an additional sample. The sample that started
                    this loop is already available as <code>event</code>.
                  </p>
                )}
              <FieldLabel label="Step type">
                <select
                  aria-label="Step type"
                  disabled={stepLocked}
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
                  <option value="placeholder" disabled={!!baseline}>
                    Placeholder
                  </option>
                  <option value="read">Read shared struct</option>
                  <option value="write">Publish shared struct</option>
                  <option value="send">Send queue message</option>
                  <option value="receive">Take next queue message</option>
                  <option value="notify">Notify task</option>
                </select>
              </FieldLabel>
              {selectedStep.kind === 'placeholder' ? (
                <>
                  <FieldLabel label="Implementation note">
                    <textarea
                      aria-label="Implementation note"
                      disabled={stepLocked}
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
                  {!importedFile && preview?.stepCode?.[selectedStep.id] && (
                    <details className="imported-code">
                      <summary>Template base code</summary>
                      <pre>{preview.stepCode[selectedStep.id]}</pre>
                      <p>
                        Read-only base code used when generating this task
                        skeleton.
                      </p>
                    </details>
                  )}
                </>
              ) : selectedStep.kind === 'notify' ? (
                <FieldLabel label="Notification target">
                  <select
                    aria-label="Notification target"
                    disabled={stepLocked}
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
                        ? 'Incoming / outgoing data'
                        : 'Latest value'
                    }
                  >
                    <select
                      aria-label="Connected struct"
                      disabled={stepLocked}
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
                      <option value="">Select data…</option>
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
                  <details className="advanced-settings">
                    <summary>Advanced local variable</summary>
                    <FieldLabel label="Local sample name">
                      <input
                        className="mono"
                        aria-label="Local snapshot name"
                        disabled={stepLocked}
                        value={selectedStep.localName ?? ''}
                        onChange={(e) =>
                          changeStep((s) => (s.localName = e.target.value))
                        }
                      />
                    </FieldLabel>
                  </details>
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
                          disabled={stepLocked}
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
                        ? 'Sending replaces any unread mailbox message. Taking it removes that message and copies it into your local variable. If empty, waits up to the configured timeout.'
                        : selectedStep.kind === 'receive'
                          ? 'Takes the oldest waiting message out of the queue and copies it into your local variable. If empty, waits up to the configured timeout. Each message goes to one receiver. A queue-triggered task already receives its message as event.'
                          : 'Adds a copy of your message to the queue. If full, waits up to the configured timeout for space. The receiving task takes messages in the order they were sent.'
                      : selectedStep.kind === 'read'
                        ? 'Copies shared data into a local snapshot.'
                        : 'Publishes the complete local snapshot. The generated helper handles the mutex.'}
                  </div>
                  {(selectedStep.kind === 'send' ||
                    selectedStep.kind === 'receive') && (
                    <div className="info-note">
                      The timeout is stored under this task’s namespace in
                      Config File. Generated helpers read it automatically; task
                      code needs no timeout argument. 0 checks immediately, -1
                      waits indefinitely, and a positive value waits that many
                      milliseconds.
                    </div>
                  )}
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
