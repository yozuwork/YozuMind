const THEME_KEY = 'yozu-theme';
export const THEMES = ['milanote', 'dark'];

export function loadTheme() {
  let theme = null;
  try { theme = localStorage.getItem(THEME_KEY); } catch {}
  return THEMES.includes(theme) ? theme : 'milanote';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch {}
}
