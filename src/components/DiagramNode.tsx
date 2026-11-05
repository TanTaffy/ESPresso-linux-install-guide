import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from '@xyflow/react';
import {
  ArrowRight,
  Braces,
  ChevronRight,
  Download,
  LockKeyhole,
  Upload,
} from 'lucide-react';
import { useEffect } from 'react';
import type { FlowNode } from '../editor/types';
import type { Phase } from '../model';
import { TaskIcon } from './TaskIcon';
export function DiagramNode({ id, data, selected }: NodeProps<FlowNode>) {
  const n = data.node,
    update = useUpdateNodeInternals();
  useEffect(() => {
    update(id);
  }, [id, n, data.types, data.showSteps, update]);
  const payload =
    n.kind === 'struct'
      ? data.types.find((t) => t.id === n.payloadTypeId)
      : undefined;
  const fields =
    n.kind === 'struct'
      ? payload
        ? payload.kind === 'struct'
          ? payload.fields
          : []
        : n.fields
      : [];
  if (n.kind === 'struct')
    return (
      <article
        className={`graph-node shared-node ${selected ? 'selected' : ''}`}
        data-testid={`node-${n.id}`}
      >
        <Handle
          type="target"
          position={Position.Left}
          id="write"
          className="data-handle"
          title={
            n.delivery === 'queue' || n.delivery === 'mailbox'
              ? 'Send into this queue'
              : 'Publish into this struct'
          }
        />
        <Handle
          type="source"
          position={Position.Right}
          id="read"
          className="data-handle"
          title={
            n.delivery === 'queue' || n.delivery === 'mailbox'
              ? 'Receive from this queue'
              : 'Read from this struct'
          }
        />
        <header>
          <span className="node-type">
            <Braces size={15} />
            {n.delivery === 'mailbox'
              ? 'Latest-value mailbox'
              : n.delivery === 'queue'
                ? 'FIFO queue'
                : 'Latest value'}
          </span>
          <button
            className="icon-button nodrag"
            aria-label={`Edit ${n.name}`}
            onClick={() => data.edit(id)}
          >
            <ChevronRight size={16} />
          </button>
        </header>
        {data.imported && (
          <span className="imported-badge">Imported · Fixed definition</span>
        )}
        <h3>{n.name || 'Unnamed data'}</h3>
        <div className="node-symbol">shared::{n.symbol}</div>
        <div className="node-fields">
          {fields.slice(0, 6).map((f) => (
            <div key={f.id}>
              <span>{f.name || 'unnamed'}</span>
              <code>
                {f.type.startsWith('type:')
                  ? (data.types.find((t) => t.id === f.type.slice(5))?.name ??
                    'Missing type')
                  : f.type}
                {f.arrayLength ? `[${f.arrayLength}]` : ''}
              </code>
            </div>
          ))}
          {fields.length > 6 && (
            <small>+ {fields.length - 6} more fields</small>
          )}
          {n.payloadTypeId && (
            <small>{payload?.name ?? 'Missing payload type'}</small>
          )}
          {!n.payloadTypeId && !fields.length && <small>No fields yet</small>}
        </div>
        <footer>
          <LockKeyhole size={13} />
          {n.delivery === 'mailbox'
            ? '1 value · overwrite unread'
            : n.delivery === 'queue'
              ? `${n.capacity ?? 8} messages · consume once`
              : 'Mutex protected'}
        </footer>
      </article>
    );
  return (
    <article
      className={`graph-node task-node ${selected ? 'selected' : ''}`}
      data-testid={`node-${n.id}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="read-new"
        style={{ top: 61 }}
        title="Connect shared data to read a snapshot or receive a queue message"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="write-new"
        style={{ top: 61 }}
        title="Connect to shared data to publish or send; connect to a notification task to notify it"
      />
      <header>
        <span className="node-type">
          <TaskIcon icon={n.icon} size={15} />
          FreeRTOS task
        </span>
        <button
          className="icon-button nodrag"
          aria-label={`Edit ${n.name}`}
          onClick={() => data.edit(id)}
        >
          <ChevronRight size={16} />
        </button>
      </header>
      {data.imported && (
        <span
          className="imported-badge"
          title="Existing code is protected. Add connectors at the start or end of loop()."
        >
          Imported · Limited functionality
        </span>
      )}
      <h3>{n.name || 'Unnamed task'}</h3>
      <div className="node-symbol">
        {n.trigger === 'queues'
          ? 'On any selected input'
          : n.trigger === 'queue'
            ? 'On queue message'
            : n.trigger === 'notification'
              ? 'On notification'
              : `${n.periodExpression || n.periodMs} ms loop`}{' '}
        · priority {n.priorityExpression || n.priority}
      </div>
      {data.showSteps &&
        (['setup', 'loop'] as Phase[]).map((phase) => (
          <div className="node-phase" key={phase}>
            <div className="phase-label">
              <span>{phase}()</span>
              <span>{phase === 'setup' ? 'once' : 'repeat'}</span>
            </div>
            {n[phase].map((s) => (
              <div className="node-step-wrap" key={s.id}>
                {(s.kind === 'read' || s.kind === 'receive') && (
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`step:${s.id}`}
                    isConnectable={!data.lockedSteps.includes(s.id)}
                    className="data-handle"
                  />
                )}
                <button
                  className={`node-step nodrag ${s.kind !== 'placeholder' ? 'access-step' : ''}`}
                  onClick={() => data.step(id, phase, s.id)}
                >
                  {s.kind === 'placeholder' ? (
                    <code>{'{ }'}</code>
                  ) : s.kind === 'read' || s.kind === 'receive' ? (
                    <Download size={13} />
                  ) : (
                    <Upload size={13} />
                  )}
                  <span>
                    {s.name || 'Unnamed step'}
                    {s.requiresCode && (
                      <small className="pending-badge">
                        Requires code update
                      </small>
                    )}
                  </span>
                </button>
                {(s.kind === 'write' ||
                  s.kind === 'send' ||
                  s.kind === 'notify') && (
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`step:${s.id}`}
                    isConnectable={!data.lockedSteps.includes(s.id)}
                    className="data-handle"
                  />
                )}
              </div>
            ))}
            {!n[phase].length && <div className="empty-phase">No steps</div>}
          </div>
        ))}
      <footer>
        <button className="text-button nodrag" onClick={() => data.edit(id)}>
          Edit steps <ArrowRight size={12} />
        </button>
      </footer>
    </article>
  );
}
export const nodeTypes = { layout: DiagramNode };
