import {
  ArrowDownToLine,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  FileCode2,
  FolderOpen,
} from 'lucide-react';
import { FieldLabel } from '../components/FieldLabel';
import type { EditorController } from '../editor/useEditor';
import type { Project } from '../model';

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
  | 'exportCanVersion'
  | 'tasks'
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
  exportCanVersion,
  tasks,
  notify,
  run,
  change,
  editNode,
  exportProject,
  errors,
  warnings,
  selectedFile,
}: Props) {
  if (!project) return null;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Export ESP-IDF skeleton</h1>
          <p>Task stubs, shared structs and ESP-IDF project files</p>
        </div>
        <button
          className="button primary"
          disabled={busy || checking || !preview?.valid}
          onClick={() => void exportProject()}
        >
          <ArrowDownToLine size={16} />
          Choose folder & export
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
              Ready to export
              {warnings.length ? ` · ${warnings.length} warnings` : ''}
            </>
          )}
        </span>
      </div>
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
            {exportCanVersion && (
              <small className="release-label">
                MSM_CAN {exportCanVersion}
              </small>
            )}
          </span>
          <button
            className="button"
            onClick={() => void run(() => window.espresso.revealExport())}
          >
            <FolderOpen size={15} />
            Open folder
          </button>
        </div>
      )}
      <div className="export-layout">
        <aside className="file-list">
          <h3>{Object.keys(preview?.files ?? {}).length} project files</h3>
          {Object.keys(preview?.files ?? {}).map((path) => (
            <button
              className={selectedFile === path ? 'active' : ''}
              key={path}
              onClick={() => setFile(path)}
            >
              <FileCode2 size={15} />
              <span>{path}</span>
            </button>
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
        {tasks.some((t) => t.preset === 'msm_can') && (
          <span>
            MSM_CAN’s latest published release is downloaded on each
            export.{' '}
          </span>
        )}
        Exports create a new folder and include the layout. Existing folders are
        never overwritten. Fill in TODO sections using your usual editor.
      </div>
    </>
  );
}
