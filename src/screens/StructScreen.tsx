import { ArrowLeft, LockKeyhole, Plus, Repeat2, Trash2, X } from 'lucide-react';
import { Empty } from '../components/Empty';
import { StructFields } from '../components/StructFields';
import type { EditorController } from '../editor/useEditor';
import type { Phase } from '../model';
import { importedNode, lockedConnection } from '../imported';
import { FieldLabel } from '../components/FieldLabel';

type Props = Pick<
  EditorController,
  | 'setView'
  | 'setSelectedId'
  | 'tasks'
  | 'structs'
  | 'shared'
  | 'updateShared'
  | 'editStep'
  | 'addNode'
  | 'removeNode'
  | 'removeConnection'
  | 'graphEdges'
  | 'change'
  | 'project'
>;
export function StructScreen({
  setView,
  setSelectedId,
  tasks,
  structs,
  shared,
  updateShared,
  editStep,
  addNode,
  removeNode,
  removeConnection,
  graphEdges,
  change,
  project,
}: Props) {
  const imported = !!importedNode(project, shared?.id);
  return shared ? (
    <>
      <div className="page-heading">
        <div>
          <h1>{shared.typeName || 'Shared struct'}</h1>
          <p>
            {shared.delivery === 'queue' &&
              shared.capacityExpression !== undefined && (
                <FieldLabel label="Capacity expression">
                  <input
                    aria-label="Capacity expression"
                    className="mono"
                    value={shared.capacityExpression}
                    onChange={(e) =>
                      updateShared((s) => {
                        s.capacityExpression = e.target.value || undefined;
                      })
                    }
                  />
                </FieldLabel>
              )}
            {shared.delivery === 'mailbox'
              ? 'Latest unread value, replaced on send'
              : shared.delivery === 'queue'
                ? 'Typed FIFO messages consumed once'
                : 'A complete snapshot shared between tasks'}
          </p>
        </div>
        <div className="actions">
          <select
            aria-label="Select shared struct"
            value={shared.id}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {structs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button className="button" onClick={() => setView('canvas')}>
            <ArrowLeft size={15} />
            Canvas
          </button>
        </div>
      </div>
      <div className="struct-layout">
        <main className="struct-editor">
          {imported && (
            <p className="imported-notice">
              <span className="imported-badge">
                Imported · Fixed definition
              </span>{' '}
              Existing names, payload fields and delivery are read-only. Add new
              connections on the canvas.
            </p>
          )}
          <div className="form-pair">
            <FieldLabel label="Delivery">
              <select
                aria-label="Data delivery"
                disabled={imported}
                value={shared.delivery ?? 'snapshot'}
                onChange={(e) =>
                  change((p) => {
                    const queue = e.target.value !== 'snapshot';
                    const data = p.nodes.find((n) => n.id === shared.id);
                    if (data?.kind !== 'struct') return;
                    data.delivery = e.target.value as typeof data.delivery;
                    data.capacity ??= 8;
                    for (const task of p.nodes)
                      if (task.kind === 'task') {
                        if (!queue && task.queueId === shared.id) {
                          task.trigger = 'periodic';
                          delete task.queueId;
                        }
                        if (!queue)
                          task.queueIds = task.queueIds?.filter(
                            (id) => id !== shared.id,
                          );
                        for (const phase of ['setup', 'loop'] as Phase[])
                          for (const s of task[phase])
                            if (s.structId === shared.id) {
                              s.kind = queue
                                ? s.kind === 'write'
                                  ? 'send'
                                  : s.kind === 'read'
                                    ? 'receive'
                                    : s.kind
                                : s.kind === 'send'
                                  ? 'write'
                                  : s.kind === 'receive'
                                    ? 'read'
                                    : s.kind;
                            }
                      }
                  })
                }
              >
                <option value="snapshot">Latest snapshot (mutex)</option>
                <option value="queue">FIFO queue</option>
                <option value="mailbox">Latest-value mailbox</option>
              </select>
            </FieldLabel>
            {shared.delivery === 'queue' && (
              <FieldLabel label="Capacity (messages)">
                <input
                  aria-label="Queue capacity"
                  type="number"
                  min={1}
                  max={4096}
                  disabled={!!shared.capacityExpression}
                  value={
                    shared.capacityExpression ? '' : (shared.capacity ?? 8)
                  }
                  onChange={(e) =>
                    updateShared((s) => {
                      s.capacity = Number(e.target.value);
                    })
                  }
                />
              </FieldLabel>
            )}
          </div>
          {shared.delivery === 'mailbox' && (
            <p className="info-note">
              One unread value. Sending replaces an older value without
              blocking; receiving consumes it.
            </p>
          )}
          <StructFields
            shared={shared}
            imported={imported}
            updateShared={updateShared}
            types={project?.types}
          />
          <div className="section-title">
            <h3>Connected tasks</h3>
          </div>
          {tasks.flatMap((t) =>
            (['setup', 'loop'] as Phase[]).flatMap((phase) =>
              t[phase]
                .filter(
                  (s) => s.structId === shared.id && s.kind !== 'placeholder',
                )
                .map((s) => (
                  <div className="connection-row" key={s.id}>
                    <button
                      className="text-button"
                      onClick={() => editStep(t.id, phase, s.id)}
                    >
                      <Repeat2 size={15} />
                      <strong>{t.name}</strong>
                      <span className="muted">
                        {phase}() · {s.name}
                      </span>
                    </button>
                    <span className="access-badge">
                      {s.kind === 'read' || s.kind === 'receive'
                        ? 'Reader'
                        : 'Writer'}
                    </span>
                    <button
                      className="icon-button danger"
                      aria-label={`Remove ${t.name} ${s.kind} connection`}
                      disabled={!!project && lockedConnection(project, s.id)}
                      onClick={() => removeConnection(s.id)}
                    >
                      <X size={15} />
                    </button>
                  </div>
                )),
            ),
          )}
          {tasks
            .filter(
              (t) =>
                (t.trigger === 'queue' && t.queueId === shared.id) ||
                (t.trigger === 'queues' && t.queueIds?.includes(shared.id)),
            )
            .map((t) => (
              <div
                className="connection-row"
                key={`trigger:${t.id}:${shared.id}`}
              >
                <strong>{t.name}</strong>
                <span>Queue trigger · receives event</span>
                <button
                  className="icon-button danger"
                  aria-label={`Remove ${t.name} queue trigger`}
                  disabled={!!importedNode(project, t.id)}
                  onClick={() =>
                    removeConnection(`trigger:${t.id}:${shared.id}`)
                  }
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          {!graphEdges.some(
            (e) => e.source === shared.id || e.target === shared.id,
          ) && (
            <p className="muted">
              No connections yet. Connect this struct on the canvas or add a
              task access step.
            </p>
          )}
        </main>
        <aside className="inspector">
          <h3>
            <LockKeyhole size={15} />
            Access behaviour
          </h3>
          <div className="info-note">
            {shared.delivery && shared.delivery !== 'snapshot' ? (
              <>
                {shared.delivery === 'mailbox'
                  ? 'Senders replace the unread value without blocking.'
                  : 'Senders append messages up to the queue capacity.'}
                <br />
                <br />
                Each receive removes one message. Multiple consumers compete;
                messages are not broadcast.
                <br />
                <br />
                Queue-triggered tasks receive their message as event.
              </>
            ) : (
              <>
                Readers take a local copy.
                <br />
                <br />
                Writers replace the whole snapshot.
                <br />
                <br />
                The mutex is released before the task continues.
              </>
            )}
          </div>
          <h3 className="spaced">Generated helpers</h3>
          <code className="helper-code">
            {shared.delivery && shared.delivery !== 'snapshot' ? (
              <>
                shared::send_{shared.symbol}(value, timeout)
                <br />
                shared::receive_{shared.symbol}(value, timeout)
              </>
            ) : (
              <>
                shared::read_{shared.symbol}()
                <br />
                shared::write_{shared.symbol}(value)
              </>
            )}
          </code>
          <button
            className="button danger spaced"
            disabled={imported}
            onClick={() => removeNode(shared.id)}
          >
            <Trash2 size={15} />
            Delete struct
          </button>
        </aside>
      </div>
    </>
  ) : (
    <Empty title="No shared structs yet">
      <button className="button primary" onClick={() => addNode('struct')}>
        <Plus size={16} />
        Add shared struct
      </button>
    </Empty>
  );
}
