import {
  ArrowDown,
  ArrowUp,
  Copy,
  Plus,
  Save,
  Trash2,
  X,
  FolderOpen,
  RefreshCw,
} from 'lucide-react';
import { FieldLabel } from '../components/FieldLabel';
import { TaskSettings } from '../components/TaskSettings';
import { TaskIcon } from '../components/TaskIcon';
import type { EditorController } from '../editor/useEditor';
import { uid, type Phase, type TaskTemplate } from '../model';
import { sectionKey } from '../templates';

type Props = Pick<
  EditorController,
  | 'project'
  | 'templates'
  | 'templateDraft'
  | 'setTemplateDraft'
  | 'newTemplate'
  | 'saveTemplate'
  | 'deleteTemplate'
  | 'busy'
  | 'run'
  | 'setError'
  | 'templateFolder'
  | 'templateErrors'
  | 'refreshTemplates'
>;
export function TemplateScreen({
  project,
  templates,
  templateDraft: draft,
  setTemplateDraft,
  newTemplate,
  saveTemplate,
  deleteTemplate,
  busy,
  run,
  setError,
  templateFolder,
  templateErrors,
  refreshTemplates,
}: Props) {
  if (!project) return null;
  function edit(update: (t: TaskTemplate) => void) {
    if (!draft) return;
    const next = structuredClone(draft);
    update(next);
    setTemplateDraft(next);
  }
  const availableLibraries = [
    ...(draft?.libraries ?? []),
    ...(project.libraries ?? []).filter(
      (l) => !draft?.libraries.some((d) => d.id === l.id),
    ),
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Task types</h1>
          <p>
            Create reusable task types for the canvas palette. Saved on this
            computer across layouts.
          </p>
        </div>
        <div className="actions">
          <button
            className="button"
            disabled={busy}
            onClick={() => void run(() => window.espresso.revealTemplates())}
          >
            <FolderOpen size={15} />
            Open templates folder
          </button>
          <button
            className="button"
            disabled={busy}
            onClick={() => void refreshTemplates()}
          >
            <RefreshCw size={15} />
            Refresh templates
          </button>
          <button className="button primary" onClick={() => newTemplate()}>
            <Plus size={15} />
            New task type
          </button>
        </div>
      </div>
      <div className="catalog-note">
        <code>{templateFolder}</code>
        <span>
          One JSON file per task type. Add or edit files here, then refresh.
        </span>
        {templateErrors.map((error) => (
          <p className="catalog-error" key={error}>
            {error}
          </p>
        ))}
      </div>
      <div className="template-layout">
        <aside className="template-list">
          {!templates.length && (
            <p className="info-note">
              Your saved task types will appear here and in the canvas palette.
            </p>
          )}
          {templates.map((t) => (
            <div
              className={`library-card ${draft?.id === t.id ? 'selected' : ''}`}
              key={t.id}
            >
              <button
                className="library-select"
                onClick={() => setTemplateDraft(structuredClone(t))}
              >
                <strong className="actions">
                  <TaskIcon icon={t.icon} size={20} />
                  {t.name}
                </strong>
                <small>{t.description || 'Custom task type'}</small>
              </button>
              <div className="actions">
                <button
                  className="button"
                  aria-label={`Duplicate task type ${t.name}`}
                  onClick={() =>
                    setTemplateDraft({
                      ...structuredClone(t),
                      id: uid(),
                      name: `${t.name} copy`,
                    })
                  }
                >
                  <Copy size={13} />
                  Duplicate
                </button>
                <button
                  className="icon-button danger"
                  disabled={busy}
                  aria-label={`Delete task type ${t.name}`}
                  onClick={() => void deleteTemplate(t.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </aside>
        {draft ? (
          <form
            className="template-editor"
            onSubmit={(e) => {
              e.preventDefault();
              void saveTemplate(draft);
            }}
          >
            <div className="section-title">
              <h2>
                {templates.some((t) => t.id === draft.id)
                  ? 'Edit task type'
                  : 'New task type'}
              </h2>
              <button className="button primary" disabled={busy} type="submit">
                <Save size={15} />
                Save task type
              </button>
            </div>
            <div className="form-pair">
              <FieldLabel label="Task type name">
                <input
                  aria-label="Task type name"
                  required
                  maxLength={200}
                  value={draft.name}
                  onChange={(e) =>
                    edit((t) => {
                      t.name = e.target.value;
                    })
                  }
                />
              </FieldLabel>
              <FieldLabel
                label="Icon"
                hint="Choose a symbol or upload PNG, JPEG or WebP artwork (up to 128 KB)."
              >
                <input
                  aria-label="Task type icon"
                  maxLength={16}
                  placeholder="📡"
                  value={draft.icon.startsWith('data:image/') ? '' : draft.icon}
                  onChange={(e) =>
                    edit((t) => {
                      t.icon = e.target.value;
                    })
                  }
                />
                <div className="actions icon-upload">
                  <TaskIcon icon={draft.icon} size={28} />
                  <input
                    type="file"
                    aria-label="Task type icon image"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (
                        file.size > 128 * 1024 ||
                        !['image/png', 'image/jpeg', 'image/webp'].includes(
                          file.type,
                        )
                      ) {
                        setError(
                          'Choose a PNG, JPEG or WebP icon up to 128 KB.',
                        );
                        return;
                      }
                      const id = draft.id;
                      const reader = new FileReader();
                      reader.onerror = () =>
                        setError('Could not read the icon image.');
                      reader.onload = () =>
                        setTemplateDraft((current) =>
                          current?.id === id
                            ? { ...current, icon: String(reader.result) }
                            : current,
                        );
                      reader.readAsDataURL(file);
                    }}
                  />
                  {draft.icon && (
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Clear task type icon"
                      onClick={() =>
                        edit((t) => {
                          t.icon = '';
                        })
                      }
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </FieldLabel>
            </div>
            <FieldLabel label="Description">
              <textarea
                aria-label="Task type description"
                rows={2}
                maxLength={8000}
                value={draft.description}
                onChange={(e) =>
                  edit((t) => {
                    t.description = e.target.value;
                  })
                }
              />
            </FieldLabel>
            <details>
              <summary>Default task settings</summary>
              <TaskSettings
                task={draft.task}
                template
                updateTask={(update) => edit((t) => update(t.task))}
              />
            </details>
            <h3>Default libraries</h3>
            <p className="info-note">
              Add libraries on the Libraries screen, then select them here.
              Their settings and local source are stored with this task type.
            </p>
            {availableLibraries.map((lib) => (
              <label className="library-assignment" key={lib.id}>
                <input
                  type="checkbox"
                  aria-label={`Template library ${lib.name}`}
                  checked={draft.libraries.some((l) => l.id === lib.id)}
                  onChange={(e) =>
                    edit((t) => {
                      t.libraries = e.target.checked
                        ? [...t.libraries, structuredClone(lib)]
                        : t.libraries.filter((l) => l.id !== lib.id);
                      t.task.libraryIds = t.libraries.map((l) => l.id);
                    })
                  }
                />
                {lib.name}{' '}
                <small>
                  {lib.source === 'github'
                    ? `${lib.repository} · ${lib.version}`
                    : 'Local source'}
                </small>
              </label>
            ))}
            <h3>Base code</h3>
            <p className="info-note">
              Code is copied into the task skeleton. Use task config settings
              for hardware settings and static or anonymous-namespace helpers
              when reusing a type. Connect project structs, queues and
              notifications after adding a task.
            </p>
            {(
              [
                ['includes', 'Includes'],
                ['helpers', 'Helpers (outside task namespace)'],
                ['state', 'Persistent task state'],
                ['setupvars', 'Setup base code'],
                ['loopvars', 'Loop base code'],
              ] as const
            ).map(([kind, label]) => {
              const key = sectionKey(kind, draft.task.id);
              return (
                <details key={kind}>
                  <summary>
                    {label}
                    {draft.code[key] ? ' · Code present' : ''}
                  </summary>
                  <textarea
                    className="mono"
                    aria-label={`Template ${label}`}
                    rows={5}
                    spellCheck={false}
                    value={draft.code[key] ?? ''}
                    onChange={(e) =>
                      edit((t) => {
                        t.code[key] = e.target.value;
                      })
                    }
                  />
                </details>
              );
            })}
            {(['setup', 'loop'] as Phase[]).map((phase) => (
              <section className="template-steps" key={phase}>
                <div className="section-title">
                  <h3>{phase}() steps</h3>
                  <button
                    className="button"
                    type="button"
                    onClick={() =>
                      edit((t) =>
                        t.task[phase].push({
                          id: uid(),
                          kind: 'placeholder',
                          name: 'New step',
                          note: '',
                        }),
                      )
                    }
                  >
                    <Plus size={14} />
                    Add {phase} step
                  </button>
                </div>
                {draft.task[phase].map((s, i) => (
                  <div className="template-step" key={s.id}>
                    <div className="actions">
                      <input
                        aria-label={`Template ${phase} step ${i + 1} name`}
                        value={s.name}
                        onChange={(e) =>
                          edit((t) => {
                            t.task[phase][i].name = e.target.value;
                          })
                        }
                      />
                      {[-1, 1].map((offset) => (
                        <button
                          className="icon-button"
                          type="button"
                          key={offset}
                          disabled={
                            i + offset < 0 ||
                            i + offset >= draft.task[phase].length
                          }
                          aria-label={`Move template ${phase} step ${i + 1} ${offset < 0 ? 'up' : 'down'}`}
                          onClick={() =>
                            edit((t) => {
                              const list = t.task[phase];
                              [list[i], list[i + offset]] = [
                                list[i + offset],
                                list[i],
                              ];
                            })
                          }
                        >
                          {offset < 0 ? (
                            <ArrowUp size={14} />
                          ) : (
                            <ArrowDown size={14} />
                          )}
                        </button>
                      ))}
                      <button
                        className="icon-button danger"
                        type="button"
                        aria-label={`Delete template ${phase} step ${i + 1}`}
                        onClick={() =>
                          edit((t) => {
                            t.task[phase].splice(i, 1);
                            delete t.code[sectionKey('step', s.id)];
                          })
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <FieldLabel label="Implementation note">
                      <textarea
                        aria-label={`Template ${phase} step ${i + 1} note`}
                        rows={2}
                        value={s.note}
                        onChange={(e) =>
                          edit((t) => {
                            t.task[phase][i].note = e.target.value;
                          })
                        }
                      />
                    </FieldLabel>
                    <FieldLabel label="Base implementation">
                      <textarea
                        className="mono"
                        aria-label={`Template ${phase} step ${i + 1} code`}
                        rows={4}
                        spellCheck={false}
                        value={draft.code[sectionKey('step', s.id)] ?? ''}
                        onChange={(e) =>
                          edit((t) => {
                            const key = sectionKey('step', s.id);
                            if (e.target.value) t.code[key] = e.target.value;
                            else delete t.code[key];
                          })
                        }
                      />
                    </FieldLabel>
                  </div>
                ))}
              </section>
            ))}
            <button className="button primary" disabled={busy} type="submit">
              <Save size={15} />
              Save task type
            </button>
          </form>
        ) : (
          <div className="info-note">
            Create a task type or use “Save as task type” on an existing task.
            Changes to a type apply when you add a new task.
          </div>
        )}
      </div>
    </>
  );
}
