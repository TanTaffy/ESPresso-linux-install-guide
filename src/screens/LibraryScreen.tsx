import { useEffect, useState } from 'react';
import {
  FolderOpen,
  Plus,
  Trash2,
  RefreshCw,
  Package,
  Github,
  ChevronRight,
} from 'lucide-react';
import { FieldLabel } from '../components/FieldLabel';
import type { EditorController } from '../editor/useEditor';
import { uid, type Library } from '../model';

type Props = Pick<
  EditorController,
  'project' | 'change' | 'run' | 'busy' | 'notify' | 'registerNavigationGuard'
>;
export function LibraryScreen({
  project,
  change,
  run,
  busy,
  notify,
  registerNavigationGuard,
}: Props) {
  const [draft, setDraft] = useState<Library | null>(
    () => project?.libraries?.[0] ?? null,
  );
  const [formDirty, setFormDirty] = useState(false);
  const discardChanges = () =>
    !formDirty ||
    window.confirm(
      'Discard unsaved library changes? Choose Cancel to keep editing or save the library first.',
    );
  function selectDraft(next: Library | null) {
    if (next?.id === draft?.id) return;
    if (!discardChanges()) return;
    setFormDirty(false);
    setDraft(next);
  }
  useEffect(() => {
    registerNavigationGuard(discardChanges);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!discardChanges()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      registerNavigationGuard(null);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [formDirty, registerNavigationGuard]);
  const [defaults, setDefaults] = useState<Library[]>([]),
    [catalogPath, setCatalogPath] = useState(''),
    [catalogErrors, setCatalogErrors] = useState<string[]>([]);
  async function refresh() {
    const catalog = await run(() => window.espresso.librariesCatalog());
    if (catalog) {
      setDefaults(catalog.items);
      setCatalogPath(catalog.path);
      setCatalogErrors(catalog.errors);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  if (!project) return null;
  const libraries = project.libraries ?? [];
  const imported = (id: string) =>
    project.imported?.libraries.some((l) => l.id === id) ?? false;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Libraries</h1>
          <p>Add a source, choose its settings, then assign it to a task.</p>
        </div>
        <div className="actions">
          <button
            className="button"
            disabled={busy}
            onClick={() => {
              if (!discardChanges()) return;
              void run(async () => {
                const library = await window.espresso.localLibrary();
                if (library) {
                  setFormDirty(false);
                  setDraft({ ...library, id: uid() });
                }
              });
            }}
          >
            <FolderOpen size={15} />
            Local folder
          </button>
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              selectDraft({
                id: uid(),
                name: '',
                source: 'github',
                repository: '',
                version: 'latest',
                headers: [],
                dependencies: [],
              })
            }
          >
            <Plus size={15} />
            GitHub release
          </button>
        </div>
      </div>
      {catalogErrors.length > 0 && (
        <div className="catalog-note">
          {catalogErrors.map((error) => (
            <p className="catalog-error" key={error}>
              {error}
            </p>
          ))}
        </div>
      )}
      <div className="library-layout">
        <section className="library-list">
          <div className="library-section-heading">
            <h2>In this project</h2>
            <span>{libraries.length}</span>
          </div>
          {!libraries.length && (
            <p className="library-empty-copy">
              No libraries yet. Choose a source folder or add a GitHub release.
            </p>
          )}
          {libraries.map((lib) => (
            <div
              className={`library-card ${draft?.id === lib.id ? 'selected' : ''}`}
              key={lib.id}
            >
              <button
                className="library-select"
                aria-pressed={draft?.id === lib.id}
                onClick={() => selectDraft(lib)}
              >
                <span className="library-row-title">
                  {lib.source === 'github' ? (
                    <Github size={16} />
                  ) : (
                    <FolderOpen size={16} />
                  )}
                  <strong>{lib.name}</strong>
                  <ChevronRight size={14} />
                </span>
                <small>
                  {lib.source === 'github'
                    ? `${lib.repository} · ${lib.version}`
                    : `${Object.keys(lib.files ?? {}).length} local source files`}
                </small>
              </button>
              <p className="library-usage">
                Used by{' '}
                {[
                  ...project.nodes
                    .filter(
                      (n) =>
                        n.kind === 'task' &&
                        (n.libraryIds ?? []).includes(lib.id),
                    )
                    .map((n) => n.name),
                  ...(project.types ?? [])
                    .filter((t) => t.libraryIds.includes(lib.id))
                    .map((t) => `${t.name} type`),
                ].join(', ') || 'no tasks or types'}
              </p>
              {
                <button
                  className="icon-button danger library-remove"
                  title={`Remove ${lib.name} from this project`}
                  aria-label={`Remove library ${lib.name}`}
                  disabled={imported(lib.id)}
                  onClick={() => {
                    if (draft?.id === lib.id && !discardChanges()) return;
                    change((p) => {
                      p.libraries = (p.libraries ?? []).filter(
                        (l) => l.id !== lib.id,
                      );
                      for (const type of p.types ?? [])
                        type.libraryIds = type.libraryIds.filter(
                          (id) => id !== lib.id,
                        );
                      for (const n of p.nodes)
                        if (n.kind === 'task')
                          n.libraryIds = (n.libraryIds ?? []).filter(
                            (id) => id !== lib.id,
                          );
                    });
                    if (draft?.id === lib.id) {
                      setFormDirty(false);
                      setDraft(null);
                    }
                    notify('Library removed. Imported task code is retained.');
                  }}
                >
                  <Trash2 size={14} />
                </button>
              }
            </div>
          ))}
          <div className="library-section-heading saved-library-heading">
            <h2>Saved libraries</h2>
            <span>
              {
                defaults.filter(
                  (lib) => !libraries.some((l) => l.id === lib.id),
                ).length
              }
            </span>
          </div>
          <p className="library-empty-copy">
            Reusable definitions you can add to this project.
          </p>
          {defaults
            .filter((lib) => !libraries.some((l) => l.id === lib.id))
            .map((lib) => (
              <div className="connection-row" key={lib.id}>
                <span>{lib.name}</span>
                <button
                  className="button"
                  disabled={busy || libraries.some((l) => l.id === lib.id)}
                  onClick={() =>
                    void run(async () => {
                      await window.espresso.checkLibrary({
                        ...project,
                        libraries: [...libraries, lib],
                      });
                      change((p) => {
                        (p.libraries ??= []).push(structuredClone(lib));
                      });
                    })
                  }
                >
                  <Plus size={14} />
                  Add
                </button>
              </div>
            ))}
          {!defaults.some((lib) => !libraries.some((l) => l.id === lib.id)) && (
            <p className="library-empty-copy">
              {defaults.length
                ? 'All saved libraries are already in this project.'
                : 'Save a library below to reuse it in future projects.'}
            </p>
          )}
          <details className="library-folder">
            <summary>
              <FolderOpen size={14} />
              Library folder
            </summary>
            <p>Definitions in this folder are available in new projects.</p>
            <code>{catalogPath}</code>
            <div className="actions">
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  void run(() => window.espresso.revealLibraries())
                }
              >
                <FolderOpen size={14} />
                Open libraries folder
              </button>
              <button
                className="icon-button"
                disabled={busy}
                aria-label="Refresh libraries"
                title="Refresh libraries"
                onClick={() => void refresh()}
              >
                <RefreshCw size={15} />
              </button>
            </div>
          </details>
        </section>
        <section className="library-details">
          {draft ? (
            <LibraryForm
              key={draft.id}
              library={draft}
              busy={busy}
              readOnly={imported(draft.id)}
              isNew={!libraries.some((lib) => lib.id === draft.id)}
              onDirtyChange={setFormDirty}
              save={async (library, saveDefault) => {
                const result = await run(() =>
                  window.espresso.checkLibrary({
                    ...project,
                    libraries: [
                      ...libraries.filter((l) => l.id !== library.id),
                      library,
                    ],
                  }),
                );
                if (!result) return;
                if (saveDefault) {
                  const catalog = await run(() =>
                    window.espresso.saveLibraryDefault(library),
                  );
                  if (!catalog) return;
                  setDefaults(catalog.items);
                  setCatalogErrors(catalog.errors);
                }
                change((p) => {
                  p.libraries = [
                    ...(p.libraries ?? []).filter((l) => l.id !== library.id),
                    library,
                  ];
                });
                setFormDirty(false);
                setDraft(null);
                notify('Library saved. Assign it under Task steps.');
              }}
              cancel={() => selectDraft(null)}
            />
          ) : (
            <div className="library-empty-state">
              <Package size={28} />
              <h2>Choose a library</h2>
              <p>
                Select one from your project, or add a local folder or GitHub
                release.
              </p>
              <p>
                Assign libraries under Task steps. Write initialisation and
                function calls in your editor.
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
function LibraryForm({
  library,
  busy,
  save,
  cancel,
  readOnly = false,
  isNew,
  onDirtyChange,
}: {
  library: Library;
  readOnly?: boolean;
  isNew: boolean;
  onDirtyChange: (dirty: boolean) => void;
  busy: boolean;
  save: (lib: Library, saveDefault: boolean) => Promise<void>;
  cancel: () => void;
}) {
  const [name, setName] = useState(library.name),
    [repository, setRepository] = useState(library.repository ?? ''),
    [version, setVersion] = useState(library.version),
    [headers, setHeaders] = useState(library.headers.join(', ')),
    [dependencies, setDependencies] = useState(library.dependencies.join(', '));
  const [saveDefault, setSaveDefault] = useState(false);
  useEffect(() => {
    onDirtyChange(
      !readOnly &&
        (saveDefault ||
          name !== library.name ||
          repository !== (library.repository ?? '') ||
          version !== library.version ||
          headers !== library.headers.join(', ') ||
          dependencies !== library.dependencies.join(', ') ||
          (isNew &&
            (library.source === 'local' ||
              !!name ||
              !!repository ||
              !!headers ||
              !!dependencies))),
    );
  }, [
    name,
    repository,
    version,
    headers,
    dependencies,
    saveDefault,
    readOnly,
    library,
    isNew,
    onDirtyChange,
  ]);
  const list = (value: string) =>
    value
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  return (
    <form
      className="library-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save(
          {
            ...library,
            name: name.trim(),
            repository: repository.trim(),
            version: version.trim(),
            headers: list(headers),
            dependencies: list(dependencies),
          },
          saveDefault,
        );
      }}
    >
      <div className="library-form-heading">
        <span className="library-source-icon">
          {library.source === 'github' ? (
            <Github size={20} />
          ) : (
            <FolderOpen size={20} />
          )}
        </span>
        <div>
          <h2>{library.name || 'Add a library'}</h2>
          <p>
            {library.source === 'github'
              ? 'GitHub release'
              : `${Object.keys(library.files ?? {}).length} local source files`}
          </p>
        </div>
      </div>
      {readOnly && (
        <p className="imported-notice">
          <span className="imported-badge">Imported · Read-only</span> Source
          and build definitions are preserved. Add a new library for additional
          functionality.
        </p>
      )}
      <fieldset disabled={readOnly} className="plain-fieldset">
        <div className="form-pair">
          <FieldLabel label="Library name">
            <input
              aria-label="Library name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FieldLabel>
          {library.source === 'github' && (
            <FieldLabel
              label="Release"
              hint="Latest stable, or a published tag."
            >
              <input
                aria-label="Library release"
                placeholder="latest or v1.0.0"
                required
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </FieldLabel>
          )}
        </div>
        {library.source === 'github' && (
          <>
            <FieldLabel
              label="GitHub repository"
              hint="Public repositories, in owner/repository format."
            >
              <input
                aria-label="GitHub repository"
                placeholder="owner/repository"
                required
                value={repository}
                onChange={(e) => setRepository(e.target.value)}
              />
            </FieldLabel>
          </>
        )}
        <FieldLabel
          label="Include headers"
          hint="Headers to include in task code, separated by commas."
        >
          <input
            aria-label="Library headers"
            placeholder="Sensor.hpp"
            value={headers}
            onChange={(e) => setHeaders(e.target.value)}
          />
        </FieldLabel>
        <details className="advanced-settings library-build-settings">
          <summary>Advanced build settings</summary>
          <FieldLabel
            label="ESP-IDF dependencies"
            hint="Component names, separated by commas."
          >
            <input
              aria-label="Library dependencies"
              placeholder="freertos, esp_timer"
              value={dependencies}
              onChange={(e) => setDependencies(e.target.value)}
            />
          </FieldLabel>
          <p className="info-note">
            ESPresso generates component CMake files for simple C/C++ source
            libraries. Custom build scripts and binary libraries are outside
            this manager.
          </p>
        </details>
        <label className="library-assignment library-save-default">
          <input
            type="checkbox"
            aria-label="Save library as default"
            checked={saveDefault}
            onChange={(e) => setSaveDefault(e.target.checked)}
          />
          Make available in future projects
        </label>
      </fieldset>
      <div className="actions library-form-actions">
        {
          <button
            className="button primary"
            disabled={busy || readOnly}
            type="submit"
          >
            Save library
          </button>
        }
        <button className="button" type="button" onClick={cancel}>
          Close
        </button>
      </div>
    </form>
  );
}
