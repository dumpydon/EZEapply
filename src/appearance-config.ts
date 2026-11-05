export const APPEARANCE_KEY = 'eze.colorTheme.v1';

export interface ThemeColors {
  bg: string;
  panel: string;
  raised: string;
  input: string;
  border: string;
  text: string;
  muted: string;
  accent: string;
  fill: string;
  hover: string;
  edge: string;
}

/** Muted dark palettes. Chart-series and error colors remain semantic. */
export const COLOR_THEMES = [
  {
    id: 'midnight',
    label: 'Midnight Teal',
    colors: {
      bg: '#151c20',
      panel: '#1c272c',
      raised: '#27343a',
      input: '#111b20',
      border: '#35464d',
      text: '#dce5e8',
      muted: '#a2b0b8',
      accent: '#86b6a8',
      fill: '#285b4f',
      hover: '#326d5f',
      edge: '#427e6e',
    },
  },
  {
    id: 'graphite',
    label: 'Graphite',
    colors: {
      bg: '#191b20',
      panel: '#23262d',
      raised: '#2d3139',
      input: '#15171c',
      border: '#3d424d',
      text: '#e1e4eb',
      muted: '#a7afbd',
      accent: '#aab4c5',
      fill: '#414b5d',
      hover: '#4b586e',
      edge: '#657289',
    },
  },
  {
    id: 'blue',
    label: 'Dusk Blue',
    colors: {
      bg: '#151c29',
      panel: '#1e2939',
      raised: '#29374a',
      input: '#111a28',
      border: '#394b64',
      text: '#e1e8f2',
      muted: '#a3b2c7',
      accent: '#9db7de',
      fill: '#344f76',
      hover: '#405f8a',
      edge: '#5e7caa',
    },
  },
  {
    id: 'violet',
    label: 'Violet',
    colors: {
      bg: '#201a29',
      panel: '#2a2235',
      raised: '#372d43',
      input: '#1b1524',
      border: '#4c3d5b',
      text: '#e9e2ef',
      muted: '#b7a8c5',
      accent: '#bbabd2',
      fill: '#58456d',
      hover: '#66517d',
      edge: '#7c6497',
    },
  },
  {
    id: 'pine',
    label: 'Pine',
    colors: {
      bg: '#172219',
      panel: '#212e23',
      raised: '#2c3b2d',
      input: '#131e15',
      border: '#3c5140',
      text: '#e2e9df',
      muted: '#aab8a5',
      accent: '#a3c09c',
      fill: '#3f5c3b',
      hover: '#4b6c46',
      edge: '#688962',
    },
  },
  {
    id: 'rosewood',
    label: 'Rosewood',
    colors: {
      bg: '#261b1e',
      panel: '#322529',
      raised: '#423136',
      input: '#20161a',
      border: '#574146',
      text: '#eee3e6',
      muted: '#c3adb5',
      accent: '#d0a4af',
      fill: '#704752',
      hover: '#805460',
      edge: '#9b6876',
    },
  },
  {
    id: 'sandstone',
    label: 'Sandstone',
    colors: {
      bg: '#231f19',
      panel: '#302a22',
      raised: '#3f372c',
      input: '#1e1a14',
      border: '#554a39',
      text: '#eae4d9',
      muted: '#bdb09c',
      accent: '#c9b48b',
      fill: '#655336',
      hover: '#756141',
      edge: '#8f7950',
    },
  },
  {
    id: 'magenta',
    label: 'Magenta Gray',
    colors: {
      bg: '#29292c',
      panel: '#303033',
      raised: '#3c383e',
      input: '#242326',
      border: '#51454f',
      text: '#f2e9ef',
      muted: '#c6b4c1',
      accent: '#d7a3c5',
      fill: '#6f2c50',
      hover: '#80375f',
      edge: '#a36185',
    },
  },
] as const satisfies readonly { id: string; label: string; colors: ThemeColors }[];

export type ColorThemeId = (typeof COLOR_THEMES)[number]['id'];
export const DEFAULT_THEME: ColorThemeId = 'midnight';
export function isColorThemeId(value: unknown): value is ColorThemeId {
  return typeof value === 'string' && COLOR_THEMES.some((theme) => theme.id === value);
}
export function colorTheme(value: unknown) {
  return COLOR_THEMES.find((theme) => theme.id === value) || COLOR_THEMES[0];
}
