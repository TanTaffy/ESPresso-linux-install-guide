export type Palette = {
  background: string;
  surface: string;
  text: string;
  accent: string;
  data: string;
};
export type Theme = { id: string; name: string; palette: Palette };
export type Appearance = { selected: string; customThemes: Theme[] };
export const themes: Theme[] = [
  {
    id: 'latte',
    name: 'Latte',
    palette: {
      background: '#f8f3eb',
      surface: '#fffdf8',
      text: '#3e3027',
      accent: '#68391e',
      data: '#628258',
    },
  },
  {
    id: 'espresso',
    name: 'Espresso',
    palette: {
      background: '#1e1a17',
      surface: '#28221e',
      text: '#efe6dc',
      accent: '#d6a77a',
      data: '#a6bb8c',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    palette: {
      background: '#111824',
      surface: '#1a2535',
      text: '#e1eaf5',
      accent: '#81a7ef',
      data: '#78c9b2',
    },
  },
  {
    id: 'paper',
    name: 'Paper',
    palette: {
      background: '#f3f5f8',
      surface: '#ffffff',
      text: '#233148',
      accent: '#3764bd',
      data: '#358071',
    },
  },
  {
    id: 'stinger',
    name: 'Stinger',
    palette: {
      background: '#f3f5f8',
      surface: '#ffffff',
      text: '#233148',
      accent: '#7540a8',
      data: '#f9d600',
    },
  },
];
export const defaultAppearance: Appearance = {
  selected: 'latte',
  customThemes: [],
};
export const paletteLabels: Record<keyof Palette, string> = {
  background: 'Background',
  surface: 'Panels',
  text: 'Text',
  accent: 'Accent',
  data: 'Shared data',
};
export function validAppearance(value: unknown): value is Appearance {
  if (!value || typeof value !== 'object') return false;
  const p = value as Appearance;
  if (
    typeof p.selected !== 'string' ||
    !Array.isArray(p.customThemes) ||
    p.customThemes.length > 20
  )
    return false;
  const ids = new Set(themes.map((t) => t.id)),
    names = new Set(themes.map((t) => t.name.toLowerCase()));
  for (const t of p.customThemes) {
    if (
      !t ||
      typeof t.id !== 'string' ||
      !/^custom-[a-z0-9-]{1,64}$/.test(t.id) ||
      ids.has(t.id) ||
      typeof t.name !== 'string' ||
      !t.name.trim() ||
      t.name.length > 40 ||
      names.has(t.name.trim().toLowerCase()) ||
      !t.palette
    )
      return false;
    if (
      !Object.keys(paletteLabels).every(
        (key) =>
          typeof t.palette[key as keyof Palette] === 'string' &&
          /^#[0-9a-f]{6}$/i.test(t.palette[key as keyof Palette]),
      )
    )
      return false;
    ids.add(t.id);
    names.add(t.name.trim().toLowerCase());
  }
  return ids.has(p.selected);
}
export const parseAppearance = (value: unknown): Appearance =>
  validAppearance(value) ? value : defaultAppearance;
export const getTheme = (appearance: Appearance) =>
  [...themes, ...appearance.customThemes].find(
    (t) => t.id === appearance.selected,
  ) ?? themes[0];
const rgb = (color: string) =>
  [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
const mix = (a: string, b: string, amount: number) =>
  '#' +
  rgb(a)
    .map((v, i) =>
      Math.round(v + (rgb(b)[i] - v) * amount)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
const luminance = (color: string) =>
  rgb(color)
    .map((v) => {
      const n = v / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
export function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export const getScheme = (theme: Theme) =>
  luminance(theme.palette.background) < 0.25 ? 'dark' : 'light';
export function themeColors(theme: Theme): Record<string, string> {
  const p = theme.palette,
    dark = getScheme(theme) === 'dark';
  const readable = (color: string, bg: string) => {
    for (let i = 0; i <= 20; i++) {
      const c = mix(color, p.text, i / 20);
      if (contrast(c, bg) >= 4.5) return c;
    }
    return p.text;
  };
  const danger = dark ? '#f298a2' : '#b54153',
    warning = dark ? '#e4bd78' : '#946210';
  return {
    background: p.background,
    surface: p.surface,
    'surface-alt': mix(p.surface, p.background, 0.5),
    field: mix(p.surface, p.background, 0.65),
    hover: mix(p.surface, p.text, 0.06),
    border: mix(p.surface, p.text, 0.15),
    'border-strong': mix(p.surface, p.text, 0.28),
    text: p.text,
    secondary: readable(mix(p.text, p.surface, 0.2), p.surface),
    muted: readable(mix(p.text, p.surface, 0.38), p.surface),
    'version-text': readable(dark ? '#a0a0a0' : '#858585', p.surface),
    faint: mix(p.text, p.surface, 0.52),
    primary: p.accent,
    'primary-hover': mix(p.accent, p.text, 0.15),
    'on-primary':
      contrast(p.accent, '#ffffff') > contrast(p.accent, '#111111')
        ? '#ffffff'
        : '#111111',
    accent: p.accent,
    'accent-text': readable(p.accent, p.background),
    'accent-bg': mix(p.surface, p.accent, dark ? 0.18 : 0.1),
    'accent-border': mix(p.surface, p.accent, 0.5),
    data: p.data,
    'data-text': readable(p.data, p.surface),
    'data-bg': mix(p.surface, p.data, dark ? 0.18 : 0.1),
    'data-border': mix(p.surface, p.data, 0.5),
    canvas: p.background,
    dots: mix(p.background, p.text, dark ? 0.14 : 0.13),
    'code-bg': mix(p.surface, p.background, 0.8),
    'code-text': p.text,
    'info-bg': mix(p.surface, p.background, 0.65),
    'success-bg': mix(p.surface, p.data, 0.12),
    'warning-bg': mix(p.surface, warning, dark ? 0.12 : 0.08),
    'warning-text': readable(warning, p.surface),
    'warning-border': mix(p.surface, warning, 0.35),
    danger: readable(danger, p.surface),
    'danger-bg': mix(p.surface, danger, dark ? 0.14 : 0.06),
    'danger-border': mix(p.surface, danger, 0.35),
    shadow: dark ? '#00000055' : '#19253814',
    overlay: dark ? '#00000099' : '#1e293b66',
    'imported-bg': mix(p.surface, p.text, 0.07),
    'imported-text': readable(mix(p.text, p.surface, 0.2), p.surface),
    'minimap-task': mix(p.surface, p.accent, 0.55),
    'minimap-data': mix(p.surface, p.data, 0.55),
    'minimap-mask': dark ? '#00000066' : '#ffffff99',
    focus: p.accent,
    handle: mix(p.surface, p.accent, 0.65),
    'handle-border': p.accent,
    brand: readable(p.accent, p.surface),
  };
}
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme.id;
  document.documentElement.style.colorScheme = getScheme(theme);
  for (const [key, value] of Object.entries(themeColors(theme)))
    document.documentElement.style.setProperty('--' + key, value);
}
