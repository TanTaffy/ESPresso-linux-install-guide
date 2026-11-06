import { useEffect, useRef, useState } from 'react';
import type { AppUpdate } from '../model';

export function UpdatePrompt({
  update,
  onClose,
}: {
  update: AppUpdate;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      onKeyDown={(event) => event.stopPropagation()}
      aria-labelledby="update-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <h2 id="update-title">A new version is available</h2>
      <p>ESPresso {update.version} is ready. Would you like to download it?</p>
      <p>The download for your system opens in your browser.</p>
      {error && (
        <p className="theme-error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button className="button" disabled={busy} autoFocus onClick={onClose}>
          Not now
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await window.espresso.downloadUpdate();
              onClose();
            } catch {
              setError('Could not open the download. Please try again.');
            } finally {
              setBusy(false);
            }
          }}
        >
          Download update
        </button>
      </div>
    </dialog>
  );
}
