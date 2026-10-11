import type { Task } from '../model';
import { FieldLabel } from './FieldLabel';
export function TaskSettings({
  task,
  updateTask,
  compact = false,
}: {
  task?: Task;
  updateTask: (edit: (task: Task) => void) => void;
  compact?: boolean;
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
            value={task.periodMs}
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
            value={task.priority}
            onChange={(e) =>
              updateTask((t) => (t.priority = Number(e.target.value)))
            }
          />
        </FieldLabel>
      </div>
      <FieldLabel label="Stack size (bytes)">
        <input
          aria-label="Stack size"
          type="number"
          min={1024}
          step={1024}
          value={task.stackBytes}
          onChange={(e) =>
            updateTask((t) => (t.stackBytes = Number(e.target.value)))
          }
        />
      </FieldLabel>
      <FieldLabel label="Core affinity">
        <select
          aria-label="Core affinity"
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
    </div>
  );
}
