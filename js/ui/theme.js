/** mode is "system", "light" or "dark". */
export function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'light' || mode === 'dark') root.dataset.theme = mode;
  else delete root.dataset.theme;
  try { localStorage.setItem('tj_theme', mode === 'light' || mode === 'dark' ? mode : 'system'); } catch { /* storage blocked */ }
}
export function currentTheme() {
  try { return localStorage.getItem('tj_theme') || 'system'; } catch { return 'system'; }
}
