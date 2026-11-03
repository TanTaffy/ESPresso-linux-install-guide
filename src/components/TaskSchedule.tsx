import type { SharedStruct, Task } from '../model';
import { FieldLabel } from './FieldLabel';

export function TaskSchedule({
  task,
  structs,
  updateTask,
  locked,
  template,
}: {
  task: Task;
  structs: SharedStruct[];
  updateTask: (edit: (task: Task) => void) => void;
  locked: boolean;
  template: boolean;
}) {
  const inputs = structs.filter(
    (s) => s.delivery === 'queue' || s.delivery === 'mailbox',
  );
  const trigger = task.trigger ?? 'periodic';
  const schedule =
    trigger === 'queue' ? `queue:${task.queueId ?? ''}` : trigger;
  const settings = (task.parameters ?? []).flatMap((p) => {
    const ref = `${task.configNamespace ?? `Config::${task.symbol}`}::${p.name}`;
    return [
      { label: `${p.label || p.name} (ms)`, value: ref },
      { label: `${p.label || p.name} (Hz)`, value: `1000 / (${ref})` },
    ];
  });
  return (
    <>
      <FieldLabel label="Run…">
        <select
          aria-label="Loop trigger"
          disabled={locked}
          value={schedule}
          onChange={(e) =>
            updateTask((t) => {
              const value = e.target.value;
              if (value.startsWith('queue:')) {
                t.trigger = 'queue';
                t.queueId = value.slice(6);
              } else {
                t.trigger = value as Task['trigger'];
                if (value === 'queues') t.queueIds ??= inputs.map((s) => s.id);
              }
            })
          }
        >
          <option value="periodic">On a schedule</option>
          {!template &&
            inputs.map((s) => (
              <option key={s.id} value={`queue:${s.id}`}>
                When {s.name} arrives
              </option>
            ))}
          {trigger === 'queue' &&
            !inputs.some((s) => s.id === task.queueId) && (
              <option value={schedule}>Choose incoming data…</option>
            )}
          {!template && (
            <option value="queues" disabled={!inputs.length}>
              When any selected input arrives
            </option>
          )}
          <option value="notification">When notified</option>
        </select>
      </FieldLabel>
      {trigger === 'periodic' && (
        <>
          <FieldLabel label="Timing">
            <select
              aria-label="Timing units"
              value={
                task.periodExpression
                  ? 'expression'
                  : task.frequencyHz !== undefined
                    ? 'frequency'
                    : 'interval'
              }
              onChange={(e) =>
                updateTask((t) => {
                  const mode = e.target.value;
                  if (mode !== 'expression') delete t.periodExpression;
                  else t.periodExpression = String(t.periodMs);
                  if (mode === 'frequency')
                    t.frequencyHz = Number((1000 / t.periodMs).toPrecision(8));
                  else delete t.frequencyHz;
                })
              }
            >
              <option value="interval">Every… (milliseconds)</option>
              <option value="frequency">At… (Hz)</option>
              <option value="expression">
                From a config setting / expression
              </option>
            </select>
          </FieldLabel>
          {task.periodExpression ? (
            <>
              <FieldLabel
                label="Config setting"
                hint="Use a task setting as an interval or frequency."
              >
                <select
                  aria-label="Timing config setting"
                  value={
                    settings.some((s) => s.value === task.periodExpression)
                      ? task.periodExpression
                      : ''
                  }
                  onChange={(e) =>
                    updateTask((t) => {
                      if (e.target.value) t.periodExpression = e.target.value;
                    })
                  }
                >
                  <option value="">Choose a setting or use Advanced…</option>
                  {settings.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </FieldLabel>
              <details className="advanced-settings">
                <summary>Advanced timing expression</summary>
                <FieldLabel
                  label="Period expression"
                  hint="C++ constant expression in milliseconds."
                >
                  <input
                    aria-label="Period expression"
                    className="mono"
                    value={task.periodExpression}
                    onChange={(e) =>
                      updateTask((t) => {
                        t.periodExpression = e.target.value;
                      })
                    }
                  />
                </FieldLabel>
              </details>
            </>
          ) : task.frequencyHz !== undefined ? (
            <FieldLabel label="Frequency (Hz)">
              <input
                aria-label="Task frequency"
                type="number"
                min={0.000278}
                max={1000}
                step="any"
                value={task.frequencyHz}
                onChange={(e) =>
                  updateTask((t) => {
                    const hz = Number(e.target.value);
                    t.frequencyHz = hz;
                    t.periodMs =
                      hz > 0
                        ? Math.max(1, Math.min(3600000, Math.round(1000 / hz)))
                        : 0;
                  })
                }
              />
            </FieldLabel>
          ) : (
            <FieldLabel label="Every (ms)">
              <input
                aria-label="Loop period"
                type="number"
                min={1}
                max={3600000}
                value={task.periodMs}
                onChange={(e) =>
                  updateTask((t) => {
                    t.periodMs = Number(e.target.value);
                  })
                }
              />
            </FieldLabel>
          )}
          {!task.periodExpression && (
            <p className="info-note">
              Every {task.periodMs} ms ·{' '}
              {task.periodMs > 0
                ? Number((1000 / task.periodMs).toPrecision(5))
                : '—'}{' '}
              Hz. Actual timing follows the FreeRTOS tick.
            </p>
          )}
        </>
      )}
      {trigger === 'queue' && (
        <p className="info-note">
          Waits for{' '}
          {inputs.find((s) => s.id === task.queueId)?.name ?? 'incoming data'}.
          Each arrival runs the loop with a sample named <code>event</code>,
          ready to use. You do not need another receive step. Each message goes
          to one receiver.
        </p>
      )}
      {trigger === 'queues' && (
        <section>
          <h3>Incoming data</h3>
          {inputs.map((s) => (
            <label className="check-row" key={s.id}>
              <input
                aria-label={`Trigger on ${s.name}`}
                type="checkbox"
                disabled={locked}
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
            The loop receives a typed event identifying its source. Pending
            inputs are served in rotation.
          </p>
        </section>
      )}
      {trigger === 'notification' && (
        <p className="info-note">
          Waits until another task notifies it. Each notification runs the loop
          once.
        </p>
      )}
      {!template && !inputs.length && (
        <p className="info-note">
          Add message data to run this task when a sample arrives.
        </p>
      )}
    </>
  );
}
