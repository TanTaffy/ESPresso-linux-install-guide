import { useEffect, useRef, useState } from 'react';
import { Palette as PaletteIcon, X } from 'lucide-react';
import {
  applyTheme,
  contrast,
  defaultAppearance,
  getTheme,
  paletteLabels,
  themes,
  validAppearance,
  type Appearance,
  type Palette,
  type Theme,
} from '../themes';
import { FieldLabel } from './FieldLabel';
export function ThemeSelector() {
  const [appearance, setAppearance] = useState<Appearance>(
    window.espresso?.initialAppearance ?? defaultAppearance,
  );
  const [draft, setDraft] = useState<Theme | null>(null);
  const [error, setError] = useState('');
  const nameInput = useRef<HTMLInputElement>(null),
    editButton = useRef<HTMLButtonElement>(null);
  const current = getTheme(appearance),
    all = [...themes, ...appearance.customThemes];
  const existing =
    draft && appearance.customThemes.some((t) => t.id === draft.id);
  const duplicate =
    !!draft &&
    all.some(
      (t) =>
        t.id !== draft.id &&
        t.name.toLowerCase() === draft.name.trim().toLowerCase(),
    );
  useEffect(() => {
    if (draft) nameInput.current?.focus();
  }, [!!draft]);
  function save(next: Appearance) {
    if (!validAppearance(next)) return;
    setAppearance(next);
    applyTheme(getTheme(next));
    setError('');
    void window.espresso
      .setAppearance(next)
      .catch(() => setError('Could not save your theme preference.'));
  }
  function close() {
    applyTheme(getTheme(appearance));
    setDraft(null);
    editButton.current?.focus();
  }
  function edit() {
    if (appearance.customThemes.some((t) => t.id === current.id)) {
      setDraft(structuredClone(current));
      return;
    }
    let name = current.name + ' custom',
      i = 2;
    while (all.some((t) => t.name.toLowerCase() === name.toLowerCase()))
      name = current.name + ' custom ' + i++;
    setDraft({
      id: 'custom-' + crypto.randomUUID(),
      name,
      palette: { ...current.palette },
    });
  }
  function colour(key: keyof Palette, value: string) {
    if (!draft) return;
    const next = { ...draft, palette: { ...draft.palette, [key]: value } };
    setDraft(next);
    applyTheme(next);
  }
  return (
    <>
      <div className="theme-selector">
        <select
          aria-label="App theme"
          title="App theme"
          value={appearance.selected}
          onChange={(e) => save({ ...appearance, selected: e.target.value })}
        >
          {all.map((theme) => (
            <option key={theme.id} value={theme.id}>
              {theme.name}
            </option>
          ))}
        </select>
        <button
          ref={editButton}
          className="icon-button"
          aria-label="Customise theme"
          title="Customise theme"
          onClick={edit}
        >
          <PaletteIcon size={16} />
        </button>
        {error && (
          <span className="theme-error" role="alert">
            {error}
          </span>
        )}
      </div>
      {draft && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <section
            className="modal theme-editor"
            role="dialog"
            aria-modal="true"
            aria-labelledby="theme-editor-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                close();
              }
              if (e.key === 'Tab') {
                const focusable = Array.from(
                  e.currentTarget.querySelectorAll<HTMLElement>(
                    'button:not(:disabled),input:not(:disabled),select:not(:disabled)',
                  ),
                );
                const first = focusable[0],
                  last = focusable.at(-1);
                if (e.shiftKey && document.activeElement === first) {
                  e.preventDefault();
                  last?.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                  e.preventDefault();
                  first?.focus();
                }
              }
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.name.trim() || duplicate) return;
                const next = { ...draft, name: draft.name.trim() };
                save({
                  selected: next.id,
                  customThemes: [
                    ...appearance.customThemes.filter((t) => t.id !== next.id),
                    next,
                  ],
                });
                setDraft(null);
                editButton.current?.focus();
              }}
            >
              <div className="theme-editor-heading">
                <h2 id="theme-editor-title">Custom theme</h2>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Close theme editor"
                  onClick={close}
                >
                  <X size={16} />
                </button>
              </div>
              <FieldLabel label="Theme name">
                <input
                  ref={nameInput}
                  aria-label="Theme name"
                  maxLength={40}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </FieldLabel>
              <p className="theme-help">
                Pick five colours. Other shades follow automatically. Changes
                preview live.
              </p>
              <div className="theme-colours">
                {(Object.keys(paletteLabels) as (keyof Palette)[]).map(
                  (key) => (
                    <label className="theme-colour" key={key}>
                      <span>{paletteLabels[key]}</span>
                      <input
                        aria-label={'Theme ' + paletteLabels[key].toLowerCase()}
                        type="color"
                        value={draft.palette[key]}
                        onChange={(e) => colour(key, e.target.value)}
                      />
                      <code>{draft.palette[key].toUpperCase()}</code>
                    </label>
                  ),
                )}
              </div>
              {(contrast(draft.palette.text, draft.palette.background) < 4.5 ||
                contrast(draft.palette.text, draft.palette.surface) < 4.5) && (
                <p className="contrast-note">
                  Text contrast is low. Try a lighter text colour on dark
                  backgrounds, or darker text on light backgrounds.
                </p>
              )}
              {duplicate && (
                <p className="contrast-note">Choose a different theme name.</p>
              )}
              <div className="actions">
                {existing && (
                  <button
                    type="button"
                    className="button danger"
                    onClick={() => {
                      save({
                        selected: 'latte',
                        customThemes: appearance.customThemes.filter(
                          (t) => t.id !== draft.id,
                        ),
                      });
                      setDraft(null);
                      editButton.current?.focus();
                    }}
                  >
                    Delete theme
                  </button>
                )}
                <button type="button" className="button" onClick={close}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="button primary"
                  disabled={
                    !draft.name.trim() ||
                    duplicate ||
                    (!existing && appearance.customThemes.length >= 20)
                  }
                >
                  Save theme
                </button>
              </div>
              {!existing && appearance.customThemes.length >= 20 && (
                <p className="theme-help">
                  Delete a custom theme before saving another.
                </p>
              )}
            </form>
          </section>
        </div>
      )}
    </>
  );
}
