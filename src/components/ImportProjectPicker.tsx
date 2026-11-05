import { useEffect, useRef } from 'react';
import { FileCode2, FolderOpen } from 'lucide-react';

export function ImportProjectPicker({
  busy,
  error,
  onChoose,
  onClose,
}: {
  busy: boolean;
  error: string;
  onChoose: (mode: 'file' | 'folder') => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal import-picker"
      aria-labelledby="import-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="import-title">Import edited project</h2>
      <p>
        Choose a folder previously exported by ESPresso, or its{' '}
        <code>espresso.project.json</code> file. Task code, configuration and
        additional project files will be preserved. Your current layout is
        replaced only after a successful import.
      </p>
      {error && (
        <p className="theme-error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button className="button quiet" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button
          className="button"
          disabled={busy}
          onClick={() => onChoose('file')}
        >
          <FileCode2 size={16} /> Choose project file
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={() => onChoose('folder')}
        >
          <FolderOpen size={16} /> Choose project folder
        </button>
      </div>
    </dialog>
  );
}
