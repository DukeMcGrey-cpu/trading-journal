import { state, on } from './store.js';
import { getSession, clearToken } from './api.js';
import { loadFromCache, startLoop, syncNow } from './sync.js';
import { defineRoutes, startRouter } from './router.js';
import { applyTheme } from './ui/theme.js';
import { showLogin } from './ui/login.js';
import { renderShell } from './ui/shell.js';
import { dashboardView } from './ui/dashboard.js';
import { calendarView, analyticsView, improveView, moreView } from './ui/placeholders.js';
import { tradesView, tradeDetailView } from './ui/trades.js';
import { tradeFormView } from './ui/tradeForm.js';
import { settingsView } from './ui/settings.js';
import { toast, $ } from './util.js';

const ROUTES = [
  { path: '/dashboard', title: 'Dashboard', view: dashboardView },
  { path: '/calendar', title: 'Calendar', view: calendarView },
  { path: '/trades', title: 'Trades', view: tradesView },
  { path: '/trade/new', title: 'Log trade', nav: '/trades', view: (o, p) => tradeFormView(o, p, 'new') },
  { path: '/trade/:id/edit', title: 'Edit trade', nav: '/trades', view: (o, p) => tradeFormView(o, p, 'edit') },
  { path: '/trade/:id/close', title: 'Close trade', nav: '/trades', view: (o, p) => tradeFormView(o, p, 'close') },
  { path: '/trade/:id', title: 'Trade', nav: '/trades', view: tradeDetailView },
  { path: '/analytics', title: 'Analytics', view: analyticsView },
  { path: '/improve', title: 'Improve', view: improveView },
  { path: '/settings', title: 'Settings', view: settingsView },
  { path: '/more', title: 'More', view: moreView }
];

let started = false;

async function startApp() {
  if (started) return;
  started = true;

  try {
    await loadFromCache();
  } catch (err) {
    console.error(err);
    toast('This browser blocked local storage, so offline mode is unavailable.', 'error', 6000);
  }

  renderShell();
  defineRoutes(ROUTES);
  startRouter($('#view'));

  // A new device has no saved theme yet: adopt the one stored in the Sheet.
  const adoptServerTheme = () => {
    const server = state.data.settings.theme;
    if (!localStorage.getItem('tj_theme') && (server === 'light' || server === 'dark')) applyTheme(server);
  };
  on('data', adoptServerTheme);

  // The server rejected the passphrase (for example it was changed): ask for it again.
  on('session', () => {
    sessionStorage.setItem('tj_msg', 'Your passphrase was not accepted. Sign in again.');
    clearToken();
    location.reload();
  });

  startLoop();
  syncNow();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(err => console.warn('Service worker not registered', err));
  }
}

function boot() {
  const savedTheme = localStorage.getItem('tj_theme');
  if (savedTheme) applyTheme(savedTheme);
  registerServiceWorker();
  const { apiUrl, token } = getSession();
  if (apiUrl && token) startApp();
  else showLogin(startApp);
}

boot();
