import { ArrowLeft, LockKeyhole, Plus, Repeat2, Trash2, X } from 'lucide-react';
import { Empty } from '../components/Empty';
import { StructFields } from '../components/StructFields';
import type { EditorController } from '../editor/useEditor';
import type { Phase } from '../model';

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
}: Props) {
  return shared ? (
    <>
      <div className="page-heading">
        <div>
          <h1>{shared.typeName || 'Shared struct'}</h1>
          <p>A complete snapshot shared between tasks</p>
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
          <StructFields shared={shared} updateShared={updateShared} />
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
                      {s.kind === 'read' ? 'Reader' : 'Writer'}
                    </span>
                    <button
                      className="icon-button danger"
                      aria-label={`Remove ${t.name} ${s.kind} connection`}
                      onClick={() => removeConnection(s.id)}
                    >
                      <X size={15} />
                    </button>
                  </div>
                )),
            ),
          )}
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
            Readers take a local copy.
            <br />
            <br />
            Writers replace the whole snapshot.
            <br />
            <br />
            The mutex is released before the task continues.
          </div>
          <h3 className="spaced">Generated helpers</h3>
          <code className="helper-code">
            shared::read_{shared.symbol}()
            <br />
            shared::write_{shared.symbol}(value)
          </code>
          <button
            className="button danger spaced"
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
