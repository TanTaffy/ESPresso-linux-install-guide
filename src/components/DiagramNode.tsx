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
  Repeat2,
  Upload,
} from 'lucide-react';
import { useEffect } from 'react';
import type { FlowNode } from '../editor/types';
import type { Phase } from '../model';
import { MsmBee } from './MsmBee';
export function DiagramNode({ id, data, selected }: NodeProps<FlowNode>) {
  const n = data.node,
    update = useUpdateNodeInternals();
  useEffect(() => {
    update(id);
  }, [id, n, data.showSteps, update]);
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
          title="Publish into this struct"
        />
        <Handle
          type="source"
          position={Position.Right}
          id="read"
          className="data-handle"
          title="Read from this struct"
        />
        <header>
          <span className="node-type">
            <Braces size={15} />
            Shared struct
          </span>
          <button
            className="icon-button nodrag"
            aria-label={`Edit ${n.name}`}
            onClick={() => data.edit(id)}
          >
            <ChevronRight size={16} />
          </button>
        </header>
        <h3>{n.typeName || 'Unnamed struct'}</h3>
        <div className="node-symbol">shared::{n.symbol}</div>
        <div className="node-fields">
          {n.fields.slice(0, 6).map((f) => (
            <div key={f.id}>
              <span>{f.name || 'unnamed'}</span>
              <code>{f.type}</code>
            </div>
          ))}
          {n.fields.length > 6 && (
            <small>+ {n.fields.length - 6} more fields</small>
          )}
          {!n.fields.length && <small>No fields yet</small>}
        </div>
        <footer>
          <LockKeyhole size={13} />
          Mutex protected
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
        title="Connect a struct to add a read step"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="write-new"
        style={{ top: 61 }}
        title="Connect to a struct to add a publish step"
      />
      <header>
        <span className="node-type">
          {n.preset === 'msm_can' ? <MsmBee /> : <Repeat2 size={15} />}
          {n.preset === 'msm_can' ? 'CAN task · MSM_CAN' : 'FreeRTOS task'}
        </span>
        <button
          className="icon-button nodrag"
          aria-label={`Edit ${n.name}`}
          onClick={() => data.edit(id)}
        >
          <ChevronRight size={16} />
        </button>
      </header>
      <h3>{n.name || 'Unnamed task'}</h3>
      <div className="node-symbol">
        {n.periodMs} ms loop · priority {n.priority}
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
                {s.kind === 'read' && (
                  <Handle
                    type="target"
                    position={Position.Left}
                    id={`step:${s.id}`}
                    className="data-handle"
                  />
                )}
                <button
                  className={`node-step nodrag ${s.kind !== 'placeholder' ? 'access-step' : ''}`}
                  onClick={() => data.step(id, phase, s.id)}
                >
                  {s.kind === 'placeholder' ? (
                    <code>{'{ }'}</code>
                  ) : s.kind === 'read' ? (
                    <Download size={13} />
                  ) : (
                    <Upload size={13} />
                  )}
                  <span>{s.name || 'Unnamed step'}</span>
                </button>
                {s.kind === 'write' && (
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={`step:${s.id}`}
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
