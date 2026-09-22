// Minimal hash router: static paths like #/dashboard, and one dynamic segment like #/trade/:id.

const table = [];
const listeners = [];
let cleanup = null;
let started = false;

export function defineRoutes(routes) { table.push(...routes); }
export const onRoute = fn => listeners.push(fn);
export const currentPath = () => location.hash.replace(/^#/, '') || '/dashboard';
export const go = path => { location.hash = '#' + path; };

function match(path) {
  for (const route of table) {
    const parts = route.path.split('/');
    const given = path.split('/');
    if (parts.length !== given.length) continue;
    const params = {};
    const ok = parts.every((p, i) => {
      if (p.startsWith(':')) { params[p.slice(1)] = decodeURIComponent(given[i]); return true; }
      return p === given[i];
    });
    if (ok) return { route, params };
  }
  return null;
}

export function startRouter(outlet) {
  if (started) return;
  started = true;

  const render = (moveFocus) => {
    if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } cleanup = null; }
    const path = currentPath();
    const found = match(path) || { route: table[0], params: {} };
    if (found.route.path !== path && !found.route.path.includes(':')) history.replaceState(null, '', '#' + found.route.path);
    document.title = `${typeof found.route.title === 'function' ? found.route.title(found.params) : found.route.title} - Trading journal`;
    listeners.forEach(fn => fn(found.route, found.params));
    window.scrollTo(0, 0);
    cleanup = found.route.view(outlet, found.params) || null;
    if (moveFocus) outlet.focus({ preventScroll: true });
  };

  window.addEventListener('hashchange', () => render(true));
  render(false);
}
