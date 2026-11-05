import type { Task, SharedStruct } from '../model';
import { TaskSchedule } from './TaskSchedule';
import { FieldLabel } from './FieldLabel';
import { Plus, X } from 'lucide-react';
export function TaskSettings({
  task,
  updateTask,
  compact = false,
  structs = [],
  template = false,
  imported,
}: {
  task?: Task;
  updateTask: (edit: (task: Task) => void) => void;
  compact?: boolean;
  structs?: SharedStruct[];
  template?: boolean;
  imported?: Task;
}) {
  if (!task) return null;
  return (
    <div className={`settings-fields ${compact ? 'compact' : ''}`}>
      {imported && (
        <p className="imported-notice">
          <span className="imported-badge">
            Imported · Limited functionality
          </span>
          <br />
          Code and existing flow are preserved. Names and config values remain
          editable; add new input/output connections as needed.
        </p>
      )}
      <FieldLabel label="Task name">
        <input
          aria-label="Task name"
          value={task.name}
          onChange={(e) => updateTask((t) => (t.name = e.target.value))}
        />
      </FieldLabel>
      <TaskSchedule
        task={task}
        structs={structs}
        updateTask={updateTask}
        locked={!!imported}
        template={template}
      />
      {task.description && <p className="info-note">{task.description}</p>}
      <datalist id="config-value-types">
        {[
          'int',
          'unsigned',
          'float',
          'double',
          'bool',
          'uint8_t',
          'uint16_t',
          'uint32_t',
        ].map((type) => (
          <option value={type} key={type} />
        ))}
      </datalist>
      <section className="parameter-settings">
        <h3>Config settings</h3>
        <p className="info-note">
          {template ? (
            'Default constants for each task created from this template.'
          ) : (
            <>Constants for this task, included in the Config File.</>
          )}
        </p>
        {(task.parameters ?? []).map((parameter, i) => (
          <div className="parameter-row" key={i}>
            <div className="form-pair">
              <FieldLabel label="Name">
                <input
                  aria-label={`Parameter name ${i}`}
                  disabled={
                    !!imported?.parameters?.some(
                      (p) => p.name === parameter.name,
                    )
                  }
                  className="mono"
                  value={parameter.name}
                  onChange={(e) =>
                    updateTask((t) => {
                      t.parameters![i].name = e.target.value;
                    })
                  }
                />
              </FieldLabel>
              <FieldLabel label="Value type">
                <input
                  aria-label={`Parameter type ${i}`}
                  list="config-value-types"
                  disabled={
                    !!imported?.parameters?.some(
                      (p) => p.name === parameter.name,
                    )
                  }
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
              disabled={
                !!imported?.parameters?.some((p) => p.name === parameter.name)
              }
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
      <details className="advanced-settings">
        <summary>Advanced task settings</summary>
        <p className="info-note">
          Config namespace:{' '}
          <code>{task.configNamespace ?? `Config::${task.symbol}`}</code>
        </p>
        <p className="info-note">
          Code names are generated from the task name and stay stable after
          export.
        </p>
        <FieldLabel label="C++ symbol" hint="Used in namespace and file names">
          <input
            aria-label="Task C++ symbol"
            disabled={!!imported || task.codeNamesLocked}
            className="mono"
            value={task.symbol}
            onChange={(e) =>
              updateTask((t) => {
                t.symbol = e.target.value;
                t.codeNamesManual = true;
              })
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
              updateTask((t) => {
                t.priority = Number(e.target.value);
              })
            }
          />
        </FieldLabel>
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
      </details>
    </div>
  );
}
