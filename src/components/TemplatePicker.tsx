import { useEffect, useState } from 'react';
import { FolderOpen, Plus, X } from 'lucide-react';
import type { EditorController } from '../editor/useEditor';
import { TaskIcon } from './TaskIcon';

type Props = Pick<
  EditorController,
  | 'templates'
  | 'templateErrors'
  | 'setTemplatePicker'
  | 'addTemplateTask'
  | 'setView'
  | 'run'
  | 'busy'
>;
export function TemplatePicker({
  templates,
  templateErrors,
  setTemplatePicker,
  addTemplateTask,
  setView,
  run,
  busy,
}: Props) {
  const [search, setSearch] = useState('');
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTemplatePicker(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setTemplatePicker]);
  const matches = templates.filter((t) =>
    `${t.name} ${t.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) setTemplatePicker(false);
      }}
    >
      <section
        className="modal template-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="template-picker-title"
      >
        <div className="section-title">
          <h2 id="template-picker-title">Add task from template</h2>
          <button
            className="icon-button"
            aria-label="Close template picker"
            onClick={() => setTemplatePicker(false)}
          >
            <X size={18} />
          </button>
        </div>
        <input
          aria-label="Search task templates"
          autoFocus
          placeholder="Find a task type…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="template-picker-list">
          {matches.map((t) => (
            <button
              className="template-choice"
              key={t.id}
              disabled={busy}
              aria-label={`Add ${t.name} task`}
              onClick={() => {
                setTemplatePicker(false);
                void addTemplateTask(t.id);
              }}
            >
              <TaskIcon icon={t.icon} size={28} />
              <span>
                <strong>{t.name}</strong>
                <small>{t.description}</small>
              </span>
              <Plus size={18} />
            </button>
          ))}
          {!matches.length && (
            <p className="info-note">
              No matching task types. Create one in Task types or add a JSON
              file to your templates folder.
            </p>
          )}
        </div>
        {templateErrors.map((error) => (
          <p className="catalog-error" key={error}>
            {error}
          </p>
        ))}
        <div className="actions">
          <button
            className="button"
            onClick={() => {
              setTemplatePicker(false);
              setView('templates');
            }}
          >
            Manage task types
          </button>
          <button
            className="button"
            onClick={() => void run(() => window.espresso.revealTemplates())}
          >
            <FolderOpen size={15} />
            Open templates folder
          </button>
        </div>
      </section>
    </div>
  );
}
