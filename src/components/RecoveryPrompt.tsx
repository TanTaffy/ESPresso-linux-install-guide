import { useEffect, useRef } from 'react';

export function RecoveryPrompt({
  name,
  busy,
  error,
  onChoose,
}: {
  name: string;
  busy: boolean;
  error: string;
  onChoose: (recover: boolean) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const recoverButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
    recoverButton.current?.focus();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal recovery-prompt"
      aria-labelledby="recovery-title"
      onCancel={(event) => event.preventDefault()}
    >
      <h2 id="recovery-title">Recover previous session?</h2>
      <p>
        A recovery copy of <strong>{name}</strong> is available. Recover it to
        continue editing, or discard it and start a new layout.
      </p>
      {error && (
        <p className="theme-error" role="alert">
          {error}
        </p>
      )}
      <div className="actions">
        <button
          className="button"
          disabled={busy}
          onClick={() => onChoose(false)}
        >
          Start new layout
        </button>
        <button
          ref={recoverButton}
          className="button primary"
          disabled={busy}
          onClick={() => onChoose(true)}
        >
          Recover layout
        </button>
      </div>
    </dialog>
  );
}
