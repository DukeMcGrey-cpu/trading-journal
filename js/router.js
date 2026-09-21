// Minimal hash router: #/dashboard, #/calendar, ...

const table = [];
const listeners = [];
let cleanup = null;
let started = false;

export function defineRoutes(routes) { table.push(...routes); }
export const onRoute = fn => listeners.push(fn);
export const currentPath = () => location.hash.replace(/^#/, '') || '/dashboard';
export const go = path => { location.hash = '#' + path; };

export function startRouter(outlet) {
  if (started) return;
  started = true;

  const render = (moveFocus) => {
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    const path = currentPath();
    const route = table.find(r => r.path === path) || table[0];
    if (route.path !== path) history.replaceState(null, '', '#' + route.path);
    document.title = `${route.title} - Trading journal`;
    listeners.forEach(fn => fn(route));
    window.scrollTo(0, 0);
    cleanup = route.view(outlet) || null;
    if (moveFocus) outlet.focus({ preventScroll: true });
  };

  window.addEventListener('hashchange', () => render(true));
  render(false);
}
