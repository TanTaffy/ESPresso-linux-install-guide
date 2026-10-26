import type { Task, SharedStruct } from '../model';
import { FieldLabel } from './FieldLabel';
import { Plus, X } from 'lucide-react';
export function TaskSettings({
  task,
  updateTask,
  compact = false,
  structs = [],
  template = false,
}: {
  task?: Task;
  updateTask: (edit: (task: Task) => void) => void;
  compact?: boolean;
  structs?: SharedStruct[];
  template?: boolean;
}) {
  if (!task) return null;
  return (
    <div className={`settings-fields ${compact ? 'compact' : ''}`}>
      <FieldLabel label="Task name">
        <input
          aria-label="Task name"
          value={task.name}
          onChange={(e) => updateTask((t) => (t.name = e.target.value))}
        />
      </FieldLabel>
      <FieldLabel label="C++ symbol" hint="Used in namespace and file names">
        <input
          aria-label="Task C++ symbol"
          className="mono"
          value={task.symbol}
          onChange={(e) => updateTask((t) => (t.symbol = e.target.value))}
        />
      </FieldLabel>
      <div className="form-pair">
        <FieldLabel label="Period (ms)">
          <input
            aria-label="Loop period"
            type="number"
            min={1}
            disabled={
              (task.trigger ?? 'periodic') !== 'periodic' ||
              !!task.periodExpression
            }
            value={task.periodExpression ? '' : task.periodMs}
            placeholder={task.periodExpression ? 'Expression' : undefined}
            onChange={(e) =>
              updateTask((t) => (t.periodMs = Number(e.target.value)))
            }
          />
        </FieldLabel>
        <FieldLabel label="Priority">
          <input
            aria-label="Task priority"
            type="number"
            min={1}
            max={24}
            disabled={!!task.priorityExpression}
            value={task.priorityExpression ? '' : task.priority}
            onChange={(e) =>
              updateTask((t) => (t.priority = Number(e.target.value)))
            }
          />
        </FieldLabel>
      </div>
      {task.priorityExpression !== undefined && (
        <FieldLabel label="Priority expression">
          <input
            aria-label="Priority expression"
            className="mono"
            value={task.priorityExpression}
            onChange={(e) =>
              updateTask((t) => {
                t.priorityExpression = e.target.value || undefined;
              })
            }
          />
        </FieldLabel>
      )}
      {(task.trigger ?? 'periodic') === 'periodic' && (
        <FieldLabel
          label="Period expression (optional)"
          hint="C++ constant expression in milliseconds. Replaces the numeric period."
        >
          <input
            aria-label="Period expression"
            className="mono"
            placeholder={`1'000 / ${task.configNamespace ?? `Config::${task.symbol}`}::SAMPLE_RATE_HZ`}
            value={task.periodExpression ?? ''}
            onChange={(e) =>
              updateTask((t) => {
                t.periodExpression = e.target.value;
              })
            }
          />
        </FieldLabel>
      )}
      <FieldLabel label="Loop trigger">
        <select
          aria-label="Loop trigger"
          value={task.trigger ?? 'periodic'}
          onChange={(e) =>
            updateTask((t) => {
              t.trigger = e.target.value as Task['trigger'];
            })
          }
        >
          <option value="periodic">Periodic</option>
          {!template && <option value="queue">Queue message</option>}
          {!template && (
            <option value="queues">Any selected queue / mailbox</option>
          )}
          <option value="notification">Task notification</option>
        </select>
      </FieldLabel>
      {task.trigger === 'queue' && (
        <FieldLabel
          label="Trigger queue"
          hint="Each loop receives one message as event. Consumers compete for messages."
        >
          <select
            aria-label="Trigger queue"
            value={task.queueId ?? ''}
            onChange={(e) =>
              updateTask((t) => {
                t.queueId = e.target.value;
              })
            }
          >
            <option value="">Select a queue…</option>
            {structs
              .filter((s) => s.delivery === 'queue' || s.delivery === 'mailbox')
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </select>
        </FieldLabel>
      )}
      {task.trigger === 'queues' && (
        <section>
          <h3>Input queues & mailboxes</h3>
          {structs
            .filter((s) => s.delivery === 'queue' || s.delivery === 'mailbox')
            .map((s) => (
              <label className="check-row" key={s.id}>
                <input
                  aria-label={`Trigger on ${s.name}`}
                  type="checkbox"
                  checked={task.queueIds?.includes(s.id) ?? false}
                  onChange={(e) =>
                    updateTask((t) => {
                      t.queueIds = e.target.checked
                        ? [...(t.queueIds ?? []), s.id]
                        : t.queueIds?.filter((id) => id !== s.id);
                    })
                  }
                />
                {s.name}
              </label>
            ))}
          <p className="info-note">
            Waits for any selected input. Each loop receives a typed event
            identifying its source. Pending inputs are served in rotation.
          </p>
        </section>
      )}
      {task.trigger === 'notification' && (
        <p className="info-note">
          Waits for a notification before each loop. Each notification runs the
          loop once.
        </p>
      )}
      {task.description && <p className="info-note">{task.description}</p>}
      <section className="parameter-settings">
        <h3>Config settings</h3>
        <p className="info-note">
          {template ? (
            'Default constants for each task created from this template.'
          ) : (
            <>
              Namespace:{' '}
              <code>{task.configNamespace ?? `Config::${task.symbol}`}</code>.
              Included in the Config File.
            </>
          )}
        </p>
        {(task.parameters ?? []).map((parameter, i) => (
          <div className="parameter-row" key={i}>
            <div className="form-pair">
              <FieldLabel label="Name">
                <input
                  aria-label={`Parameter name ${i}`}
                  className="mono"
                  value={parameter.name}
                  onChange={(e) =>
                    updateTask((t) => {
                      t.parameters![i].name = e.target.value;
                    })
                  }
                />
              </FieldLabel>
              <FieldLabel label="C++ type">
                <input
                  aria-label={`Parameter type ${i}`}
                  className="mono"
                  value={parameter.type ?? 'auto'}
                  placeholder="uint32_t"
                  onChange={(e) =>
                    updateTask((t) => {
                      t.parameters![i].type = e.target.value;
                    })
                  }
                />
              </FieldLabel>
            </div>
            <FieldLabel
              label={parameter.label || 'Value'}
              hint="Literal or C++ constant expression."
            >
              <input
                className="mono"
                aria-label={`Parameter value ${parameter.name}`}
                value={parameter.value}
                onChange={(e) =>
                  updateTask((t) => {
                    t.parameters![i].value = e.target.value;
                  })
                }
              />
            </FieldLabel>
            <details className="setting-description">
              <summary>Label & description</summary>
              <FieldLabel label="Label">
                <input
                  aria-label={`Parameter label ${i}`}
                  value={parameter.label}
                  onChange={(e) =>
                    updateTask((t) => {
                      t.parameters![i].label = e.target.value;
                    })
                  }
                />
              </FieldLabel>
              <FieldLabel label="Description">
                <input
                  aria-label={`Parameter description ${i}`}
                  value={parameter.description}
                  onChange={(e) =>
                    updateTask((t) => {
                      t.parameters![i].description = e.target.value;
                    })
                  }
                />
              </FieldLabel>
            </details>
            <button
              type="button"
              className="text-button danger"
              aria-label={`Remove parameter ${parameter.name}`}
              onClick={() =>
                updateTask((t) => {
                  t.parameters!.splice(i, 1);
                })
              }
            >
              <X size={14} />
              Remove setting
            </button>
          </div>
        ))}
        <button
          type="button"
          className="button"
          onClick={() =>
            updateTask((t) => {
              const names = new Set((t.parameters ?? []).map((p) => p.name));
              let i = 1;
              while (names.has(`setting_${i}`)) i++;
              (t.parameters ??= []).push({
                name: `setting_${i}`,
                type: 'int',
                label: '',
                description: '',
                value: '0',
              });
            })
          }
        >
          <Plus size={14} />
          Add setting
        </button>
      </section>
      <FieldLabel label="Stack size (bytes)">
        <input
          aria-label="Stack size"
          type="number"
          min={1024}
          step={1024}
          disabled={!!task.stackExpression}
          value={task.stackExpression ? '' : task.stackBytes}
          onChange={(e) =>
            updateTask((t) => (t.stackBytes = Number(e.target.value)))
          }
        />
      </FieldLabel>
      {task.stackExpression !== undefined && (
        <FieldLabel label="Stack expression">
          <input
            aria-label="Stack expression"
            className="mono"
            value={task.stackExpression}
            onChange={(e) =>
              updateTask((t) => {
                t.stackExpression = e.target.value || undefined;
              })
            }
          />
        </FieldLabel>
      )}
      <FieldLabel label="Core affinity">
        <select
          aria-label="Core affinity"
          disabled={!!task.coreExpression}
          value={task.core}
          onChange={(e) =>
            updateTask((t) => (t.core = e.target.value as Task['core']))
          }
        >
          <option value="any">Any core</option>
          <option value="0">Core 0</option>
          <option value="1">Core 1</option>
        </select>
      </FieldLabel>
      {task.coreExpression !== undefined && (
        <FieldLabel label="Core expression">
          <input
            aria-label="Core expression"
            className="mono"
            value={task.coreExpression}
            onChange={(e) =>
              updateTask((t) => {
                t.coreExpression = e.target.value || undefined;
              })
            }
          />
        </FieldLabel>
      )}
    </div>
  );
}
