import { useEffect, useState } from 'react';
import { FolderOpen, Plus, Trash2, RefreshCw } from 'lucide-react';
import { FieldLabel } from '../components/FieldLabel';
import type { EditorController } from '../editor/useEditor';
import { uid, type Library } from '../model';

type Props = Pick<
  EditorController,
  'project' | 'change' | 'run' | 'busy' | 'notify'
>;
export function LibraryScreen({ project, change, run, busy, notify }: Props) {
  const [draft, setDraft] = useState<Library | null>(null);
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
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Libraries</h1>
          <p>
            Add C/C++ libraries, then assign them to tasks. Write function calls
            in your usual editor.
          </p>
        </div>
        <div className="actions">
          <button
            className="button"
            disabled={busy}
            onClick={() => void run(() => window.espresso.revealLibraries())}
          >
            <FolderOpen size={15} />
            Open libraries folder
          </button>
          <button
            className="button"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCw size={15} />
            Refresh libraries
          </button>
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const library = await window.espresso.localLibrary();
                if (library) setDraft({ ...library, id: uid() });
              })
            }
          >
            <FolderOpen size={15} />
            Local folder
          </button>
          <button
            className="button primary"
            onClick={() =>
              setDraft({
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
      <div className="catalog-note">
        <code>{catalogPath}</code>
        <span>
          Library definitions in this folder are available in new layouts.
        </span>
        {catalogErrors.map((error) => (
          <p className="catalog-error" key={error}>
            {error}
          </p>
        ))}
      </div>
      <div className="library-layout">
        <section className="library-list">
          {!libraries.length && (
            <p>
              No libraries yet. Choose a source folder or add a GitHub release.
            </p>
          )}
          {libraries.map((lib) => (
            <div className="library-card" key={lib.id}>
              <button className="library-select" onClick={() => setDraft(lib)}>
                <strong>{lib.name}</strong>
                <small>
                  {lib.source === 'github'
                    ? `${lib.repository} · ${lib.version}`
                    : `${Object.keys(lib.files ?? {}).length} local source files`}
                </small>
              </button>
              <p>
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
                  className="button danger"
                  aria-label={`Remove library ${lib.name}`}
                  onClick={() => {
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
                    if (draft?.id === lib.id) setDraft(null);
                    notify('Library removed. Imported task code is retained.');
                  }}
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              }
            </div>
          ))}
          <h3 className="spaced">From your libraries folder</h3>
          {defaults.map((lib) => (
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
                {libraries.some((l) => l.id === lib.id)
                  ? 'In this layout'
                  : 'Add to layout'}
              </button>
            </div>
          ))}
        </section>
        <section className="library-details">
          {draft ? (
            <LibraryForm
              key={draft.id}
              library={draft}
              busy={busy}
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
                setDraft(null);
                notify('Library saved. Assign it under Task steps.');
              }}
              cancel={() => setDraft(null)}
            />
          ) : (
            <div className="info-note">
              Select a library to view its settings. Local source is stored with
              the layout; GitHub source is fetched on export. Class instances
              and initialisation belong in the editable task sections.
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
}: {
  library: Library;
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
  const list = (value: string) =>
    value
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  return (
    <form
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
      <h2>Library settings</h2>
      <FieldLabel label="Component name">
        <input
          aria-label="Library name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </FieldLabel>
      {library.source === 'github' && (
        <>
          <FieldLabel label="GitHub repository">
            <input
              aria-label="GitHub repository"
              placeholder="owner/repository"
              required
              value={repository}
              onChange={(e) => setRepository(e.target.value)}
            />
          </FieldLabel>
          <FieldLabel label="Release">
            <input
              aria-label="Library release"
              placeholder="latest or v1.0.0"
              required
              value={version}
              onChange={(e) => setVersion(e.target.value)}
            />
          </FieldLabel>
          <p className="info-note">
            Use latest for a fresh stable release on every export, or enter a
            published release tag. Public repositories only.
          </p>
        </>
      )}
      <FieldLabel label="Task include headers (comma separated)">
        <input
          aria-label="Library headers"
          placeholder="Sensor.hpp"
          value={headers}
          onChange={(e) => setHeaders(e.target.value)}
        />
      </FieldLabel>
      <FieldLabel label="ESP-IDF dependencies (comma separated)">
        <input
          aria-label="Library dependencies"
          placeholder="freertos, esp_timer"
          value={dependencies}
          onChange={(e) => setDependencies(e.target.value)}
        />
      </FieldLabel>
      <p className="info-note">
        ESPresso generates component CMake files for simple C/C++ source
        libraries. Custom build scripts and binary libraries are outside this
        manager.
      </p>
      <label className="library-assignment">
        <input
          type="checkbox"
          aria-label="Save library as default"
          checked={saveDefault}
          onChange={(e) => setSaveDefault(e.target.checked)}
        />
        Save to libraries folder for future layouts
      </label>
      <div className="actions">
        {
          <button className="button primary" disabled={busy} type="submit">
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
