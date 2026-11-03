import { FolderOpen } from 'lucide-react';
import type { EditorController } from '../editor/useEditor';

export function ConfigFileScreen({
  project,
  preview,
  run,
  change,
  busy,
  tasks,
  editNode,
}: Pick<
  EditorController,
  'project' | 'preview' | 'run' | 'change' | 'busy' | 'tasks' | 'editNode'
>) {
  if (!project) return null;
  const path = project.configFile?.path ?? 'config/Config.hpp';
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Config File</h1>
          <p>
            Project configuration. Add and edit constants in each task’s
            settings.
          </p>
        </div>
        <button
          className="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const imported = await window.espresso.importConfig(project);
              if (imported) change((p) => Object.assign(p, imported));
            })
          }
        >
          <FolderOpen size={15} />
          Import config file
        </button>
      </div>
      <section className="config-file-view">
        <div className="config-task-links" aria-label="Edit task configuration">
          {tasks.map((task) => (
            <button
              className="button"
              key={task.id}
              onClick={() => editNode(task.id)}
            >
              Edit {task.name} settings
            </button>
          ))}
        </div>
        <div className="section-title">
          <h2>{path}</h2>
          <span className="muted">
            Read-only preview · exported under main/
          </span>
        </div>
        <pre className="header-preview" aria-label="Config file preview">
          {preview?.configContent ??
            project.configFile?.content ??
            '#pragma once\n#include <cstdint>\n'}
        </pre>
        <p className="info-note">
          Task namespaces are created automatically. After exporting, you can
          add constants and other code to this file in your editor. Import the
          project later to recover recognised constants as task settings and
          preserve the rest of the file.
        </p>
      </section>
    </>
  );
}
