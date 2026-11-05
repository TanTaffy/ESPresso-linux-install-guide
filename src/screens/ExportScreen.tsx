import {
  ArrowDownToLine,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  FileCode2,
  FolderOpen,
  Code2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { FieldLabel } from '../components/FieldLabel';
import type { EditorController } from '../editor/useEditor';
import type { Project, DeveloperTools } from '../model';

type Props = Pick<
  EditorController,
  | 'project'
  | 'setView'
  | 'setSelectedId'
  | 'preview'
  | 'checking'
  | 'setFile'
  | 'setError'
  | 'busy'
  | 'exportPath'
  | 'exportParent'
  | 'chooseExportFolder'
  | 'editStep'
  | 'notify'
  | 'run'
  | 'change'
  | 'editNode'
  | 'exportProject'
  | 'errors'
  | 'warnings'
  | 'selectedFile'
>;
export function ExportScreen({
  project,
  setView,
  setSelectedId,
  preview,
  checking,
  setFile,
  setError,
  busy,
  exportPath,
  exportParent,
  chooseExportFolder,
  editStep,
  notify,
  run,
  change,
  editNode,
  exportProject,
  errors,
  warnings,
  selectedFile,
}: Props) {
  const [tools, setTools] = useState<DeveloperTools | null>(null);
  useEffect(() => {
    void window.espresso
      .developerTools()
      .then(setTools)
      .catch((e) => setError(String(e)));
  }, [setError]);
  if (!project) return null;
  const userFiles = Object.keys(preview?.files ?? {}).filter(
    (path) =>
      path === 'main/main.cpp' ||
      /^main\/config\//.test(path) ||
      /^main\/tasks\/.*_task\.cpp$/.test(path) ||
      (!!project.extraFiles?.[path] && !path.startsWith('components/')),
  );
  const libraryFiles = Object.keys(preview?.files ?? {}).filter((path) =>
    path.startsWith('components/'),
  );
  const supportFiles = Object.keys(preview?.files ?? {}).filter(
    (path) => !userFiles.includes(path) && !libraryFiles.includes(path),
  );
  const unfinished = project.nodes.flatMap((task) =>
    task.kind !== 'task'
      ? []
      : (['setup', 'loop'] as const).flatMap((phase) =>
          task[phase]
            .filter(
              (step) =>
                step.requiresCode ||
                (step.kind === 'placeholder' &&
                  !Object.values(project.sourceFiles ?? {}).some(
                    (file) => file.taskId === task.id,
                  ) &&
                  preview?.stepStates?.[step.id] !== 'Code present'),
            )
            .map((step) => ({ task, phase, step })),
        ),
  );
  const buildCommands = [
    ...(tools?.idfPath
      ? [`. '${tools.idfPath.replaceAll("'", "''")}\\export.ps1'`]
      : []),
    ...(exportPath
      ? [`Set-Location -LiteralPath '${exportPath.replaceAll("'", "''")}'`]
      : []),
    `idf.py set-target ${project.target}`,
    'idf.py build',
  ].join('\n');
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Export ESP-IDF skeleton</h1>
          <p>Review your task code, then export and build</p>
        </div>
        <button
          className="button primary"
          disabled={busy || checking || !preview?.valid}
          onClick={() => void exportProject()}
        >
          <ArrowDownToLine size={16} />
          {busy
            ? 'Exporting…'
            : exportParent
              ? 'Export skeleton'
              : 'Choose output folder'}
        </button>
      </div>
      <div className="export-settings">
        <FieldLabel label="Project / output folder name">
          <input
            aria-label="Project name"
            value={project.name}
            onChange={(e) => change((p) => (p.name = e.target.value))}
          />
        </FieldLabel>
        <FieldLabel label="ESP32 target">
          <select
            aria-label="ESP32 target"
            disabled={!!project.imported}
            title={
              project.imported
                ? 'The imported hardware target is fixed.'
                : undefined
            }
            value={project.target}
            onChange={(e) =>
              change((p) => (p.target = e.target.value as Project['target']))
            }
          >
            <option value="esp32s3">ESP32-S3</option>
            <option value="esp32">ESP32</option>
            <option value="esp32c3">ESP32-C3</option>
          </select>
        </FieldLabel>
        <span className={`export-check ${errors.length ? 'invalid' : ''}`}>
          {checking ? (
            'Checking layout…'
          ) : errors.length ? (
            <>
              <CircleAlert size={15} />
              {errors.length} errors to fix
            </>
          ) : (
            <>
              <Check size={15} />
              Structure valid
              {warnings.length ? ` · ${warnings.length} warnings` : ''}
            </>
          )}
        </span>
      </div>
      <div className="export-destination">
        <span>
          {exportParent ? (
            <>
              New folder:{' '}
              <strong>
                {exportParent.replace(/[\\/]$/, '')}\{project.name}
              </strong>
            </>
          ) : (
            <>
              Choose a parent folder. ESPresso will create a new{' '}
              <strong>{project.name}</strong> folder inside it.
            </>
          )}
        </span>
        {exportParent && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => void chooseExportFolder()}
          >
            Change folder
          </button>
        )}
      </div>
      <details className="implementation-review">
        <summary>
          {unfinished.length
            ? `${unfinished.length} implementation steps to fill in`
            : 'Implementation review'}{' '}
          · skeleton export is available
        </summary>
        <p className="info-note">
          Structure checks do not verify hardware code. Fill in implementation
          steps in your editor and review template code before running on a
          board.
        </p>
        {unfinished.map(({ task, phase, step }) => (
          <button
            className="text-button"
            key={step.id}
            onClick={() => editStep(task.id, phase, step.id)}
          >
            {task.name} · {phase} · {step.name}
            <ChevronRight size={13} />
          </button>
        ))}
        {!!project.sourceFiles && (
          <p className="info-note">
            Imported task implementations are preserved. Review them in your
            editor.
          </p>
        )}
      </details>
      {preview && preview.diagnostics.length > 0 && (
        <div className="diagnostics">
          {preview.diagnostics.map((d, i) => (
            <button
              key={i}
              className={d.severity}
              onClick={() => {
                if (d.nodeId) {
                  setSelectedId(d.nodeId);
                  editNode(d.nodeId);
                } else setView('export');
              }}
            >
              <CircleAlert size={14} />
              <span>{d.message}</span>
              {d.nodeId && <ChevronRight size={14} />}
            </button>
          ))}
        </div>
      )}
      {exportPath && (
        <div className="export-success">
          <Check size={17} />
          <span>
            Exported to <strong>{exportPath}</strong>
          </span>
          <button
            className="button"
            disabled={!tools?.editorPath || busy}
            title={
              !tools?.editorPath
                ? 'VS Code was not found. Open the folder in your usual editor.'
                : undefined
            }
            onClick={() => void run(() => window.espresso.openExportInEditor())}
          >
            <Code2 size={15} />
            Open in VS Code
          </button>
          <button
            className="button"
            onClick={() => void run(() => window.espresso.revealExport())}
          >
            <FolderOpen size={15} />
            Open folder
          </button>
        </div>
      )}
      {exportPath && (
        <details className="build-guide" open>
          <summary>Build your program</summary>
          <p className="info-note">
            {tools?.idfPath
              ? `ESP-IDF found: ${tools.idfPath}.`
              : 'ESP-IDF was not found in the environment or the standard Espressif frameworks folder. Install ESP-IDF, then open its terminal.'}{' '}
            SDK detection does not check toolchain activation. Run these
            commands in PowerShell
            {tools?.idfPath ? '' : ' after activating ESP-IDF'}:
          </p>
          <div className="build-commands">
            <pre>{buildCommands}</pre>
            <button
              className="button"
              onClick={() =>
                void navigator.clipboard
                  .writeText(buildCommands)
                  .then(() => notify('Build commands copied'))
                  .catch((e) => setError(String(e)))
              }
            >
              <Copy size={14} />
              Copy commands
            </button>
          </div>
          <p className="info-note">
            Continue editing in this folder. Use “Import edited code” and choose
            this project folder when returning to ESPresso; “Open layout”
            restores the diagram only.
          </p>
        </details>
      )}
      <div className="export-layout">
        <aside className="file-list">
          <h3>{Object.keys(preview?.files ?? {}).length} project files</h3>
          {(
            [
              ['Your code', userFiles],
              ['Libraries', libraryFiles],
              ['Generated support', supportFiles],
            ] as const
          ).map(([title, paths]) => (
            <section key={title}>
              <h4>{title}</h4>
              {paths.map((path) => (
                <button
                  className={selectedFile === path ? 'active' : ''}
                  key={path}
                  onClick={() => setFile(path)}
                >
                  <FileCode2 size={15} />
                  <span>{path}</span>
                </button>
              ))}
            </section>
          ))}
        </aside>
        <main className="code-preview">
          <div className="code-heading">
            <code>{selectedFile ?? 'Fix layout errors to generate files'}</code>
            <span>Read-only preview</span>
            <button
              className="icon-button"
              aria-label="Copy preview"
              disabled={!selectedFile}
              onClick={() => {
                void navigator.clipboard
                  .writeText(preview?.files[selectedFile] ?? '')
                  .then(() => notify('Preview copied'))
                  .catch((e) => setError(String(e)));
              }}
            >
              <Copy size={15} />
            </button>
          </div>
          <pre>
            {selectedFile
              ? preview?.files[selectedFile]
              : 'Fix the layout errors to preview the generated project files.'}
          </pre>
        </main>
      </div>
      <div className="export-note">
        Exports create a new folder and include the layout. Existing folders are
        never overwritten. Fill in TODO sections using your usual editor.
      </div>
    </>
  );
}
