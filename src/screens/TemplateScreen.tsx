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
  ChevronRight,
  Layers,
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
          <p>Save a task once. Reuse its settings and steps in any layout.</p>
        </div>
        <div className="actions">
          <button className="button primary" onClick={() => newTemplate()}>
            <Plus size={15} />
            New task type
          </button>
        </div>
      </div>
      {templateErrors.length > 0 && (
        <div className="catalog-note" role="alert">
          {templateErrors.map((error) => (
            <p className="catalog-error" key={error}>
              {error}
            </p>
          ))}
        </div>
      )}
      <div className="template-layout">
        <aside className="template-list">
          <div className="library-section-heading">
            <h2>Saved task types</h2>
            <span>{templates.length}</span>
          </div>
          {!templates.length && (
            <p className="library-empty-copy">
              No task types yet. Create one to use across your layouts.
            </p>
          )}
          {templates.map((t) => (
            <div
              className={`library-card ${draft?.id === t.id ? 'selected' : ''}`}
              key={t.id}
            >
              <button
                className="library-select"
                aria-pressed={draft?.id === t.id}
                onClick={() => setTemplateDraft(structuredClone(t))}
              >
                <span className="library-row-title">
                  <TaskIcon icon={t.icon} size={20} />
                  <strong>{t.name}</strong>
                  <ChevronRight size={14} />
                </span>
                <small>{t.description || 'Custom task type'}</small>
              </button>
              <div className="template-card-footer">
                <span>
                  {t.task.setup.length + t.task.loop.length}{' '}
                  {t.task.setup.length + t.task.loop.length === 1
                    ? 'step'
                    : 'steps'}
                </span>
                <div className="actions">
                  <button
                    className="icon-button"
                    title={`Duplicate ${t.name}`}
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
                  </button>
                  <button
                    className="icon-button danger"
                    disabled={busy}
                    aria-label={`Delete task type ${t.name}`}
                    title={`Delete ${t.name}`}
                    onClick={() => void deleteTemplate(t.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
          <details className="library-folder template-folder">
            <summary>
              <FolderOpen size={14} />
              Task types folder
            </summary>
            <p>
              To share task types, copy their files into this folder, then
              refresh.
            </p>
            <code>{templateFolder}</code>
            <div className="actions">
              <button
                className="button"
                aria-label="Open templates folder"
                disabled={busy}
                onClick={() =>
                  void run(() => window.espresso.revealTemplates())
                }
              >
                <FolderOpen size={14} />
                Open folder
              </button>
              <button
                className="button"
                aria-label="Refresh templates"
                disabled={busy}
                onClick={() => void refreshTemplates()}
              >
                <RefreshCw size={14} />
                Refresh
              </button>
            </div>
          </details>
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
              <div className="template-editor-heading">
                <span className="library-source-icon">
                  <TaskIcon icon={draft.icon} size={22} />
                </span>
                <div>
                  <h2>{draft.name || 'New task type'}</h2>
                  <p>Changes apply to new tasks you add to the canvas.</p>
                </div>
              </div>
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
          <section className="template-empty-state">
            <span className="template-empty-icon">
              <Layers size={28} strokeWidth={1.5} />
            </span>
            <h2>
              {templates.length
                ? 'Choose a task type'
                : 'Build your task collection'}
            </h2>
            <p>
              {templates.length
                ? 'Select a task type to edit its settings and steps, or create one from scratch.'
                : 'Keep the settings, libraries and steps you use often, ready for your next program.'}
            </p>
            <button className="button" onClick={() => newTemplate()}>
              <Plus size={15} />
              Create task type
            </button>
            <p className="template-empty-hint">
              You can also use “Save as task type” on any task.
            </p>
          </section>
        )}
      </div>
    </>
  );
}
