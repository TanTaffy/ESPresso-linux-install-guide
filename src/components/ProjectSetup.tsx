import { useEffect, useRef, useState } from 'react';
import type { Project } from '../model';
import { FieldLabel } from './FieldLabel';

export function ProjectSetup({
  project,
  onApply,
  onClose,
}: {
  project: Project;
  onApply: (name: string, target: Project['target']) => void;
  onClose: () => void;
}) {
  const fresh = project.name === 'untitled-project';
  const [name, setName] = useState(fresh ? '' : project.name);
  const [target, setTarget] = useState(project.target);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal project-setup"
      aria-labelledby="project-settings-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onApply(name.trim(), target);
        }}
      >
        <h2 id="project-settings-title">Project settings</h2>
        <p>Set the project name and target board.</p>
        <FieldLabel
          label="Project name"
          hint="Used for the saved layout and exported folder."
        >
          <input
            aria-label="Project name"
            autoFocus
            required
            pattern="[A-Za-z][A-Za-z0-9_\-]{0,63}"
            maxLength={64}
            placeholder="pressure-node"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </FieldLabel>
        <FieldLabel label="Board">
          <select
            aria-label="ESP32 target"
            disabled={!!project.imported}
            value={target}
            onChange={(e) => setTarget(e.target.value as Project['target'])}
          >
            <option value="esp32s3">ESP32-S3</option>
            <option value="esp32">ESP32</option>
            <option value="esp32c3">ESP32-C3</option>
          </select>
        </FieldLabel>
        <div className="actions">
          <button type="button" className="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit">
            Apply settings
          </button>
        </div>
      </form>
    </dialog>
  );
}
