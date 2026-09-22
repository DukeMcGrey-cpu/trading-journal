// The frame around every screen: desktop side rail, mobile tab bar, top bar, account switcher, sync status.
import { html, mount, $, $$, timeAgo, toast } from '../util.js';
import { state, on, activeAccounts, setActiveAccount } from '../store.js';
import { syncNow } from '../sync.js';
import { onRoute } from '../router.js';
import { icon, brandMark } from './icons.js';

export const NAV = [
  { path: '/dashboard', label: 'Dashboard', icon: 'home' },
  { path: '/calendar', label: 'Calendar', icon: 'calendar' },
  { path: '/trades', label: 'Trades', icon: 'list' },
  { path: '/analytics', label: 'Analytics', icon: 'chart' },
  { path: '/improve', label: 'Improve', icon: 'bulb' },
  { path: '/settings', label: 'Settings', icon: 'sliders' }
];

const MORE_GROUP = '/more,/analytics,/improve,/settings';

export function logTrade() {
  location.hash = '#/trade/new';
}

export function renderShell() {
  mount($('#app'), html`
    <div class="app">
      <aside class="rail">
        <a class="brand" href="#/dashboard">${brandMark(32)}<span>Trading journal</span></a>
        <button class="btn btn-primary btn-block" type="button" data-action="log-trade">${icon('plus', 18)}<span>Log trade</span></button>
        <nav class="rail-nav" aria-label="Main">
          ${NAV.map(n => html`<a class="rail-link" href="#${n.path}" data-path="${n.path}">${icon(n.icon, 20)}<span>${n.label}</span></a>`)}
        </nav>
        <div class="rail-foot"><button class="sync-pill" type="button" data-action="sync-now" data-sync-pill></button></div>
      </aside>

      <div class="stage">
        <header class="topbar">
          <h1 class="page-title" id="page-title"></h1>
          <div class="topbar-actions">
            <label class="acct-switch" id="acct-wrap" hidden>
              <span class="sr-only">Account</span>
              <select id="acct-switch"></select>
            </label>
            <button class="sync-pill" type="button" data-action="sync-now" data-sync-pill></button>
          </div>
        </header>
        <main id="view" tabindex="-1"></main>
      </div>

      <nav class="tabbar" aria-label="Main">
        <a class="tab" href="#/dashboard" data-path="/dashboard">${icon('home')}<span>Home</span></a>
        <a class="tab" href="#/calendar" data-path="/calendar">${icon('calendar')}<span>Calendar</span></a>
        <button class="tab-fab" type="button" data-action="log-trade" aria-label="Log trade">${icon('plus', 26)}</button>
        <a class="tab" href="#/trades" data-path="/trades">${icon('list')}<span>Trades</span></a>
        <a class="tab" href="#/more" data-path="/more" data-group="${MORE_GROUP}">${icon('more')}<span>More</span></a>
      </nav>
    </div>`);

  const app = $('#app');
  app.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.closest('#view')) return;
    if (btn.dataset.action === 'log-trade') logTrade();
    if (btn.dataset.action === 'sync-now') syncNow().then(() => { if (state.sync.status === 'idle') toast('Up to date'); });
  });
  $('#acct-switch').addEventListener('change', e => setActiveAccount(e.target.value));

  onRoute(route => {
    $('#page-title').textContent = route.title;
    const target = route.nav || route.path;
    $$('[data-path]', app).forEach(el => {
      const here = el.dataset.path === target || (el.dataset.group || '').split(',').includes(target);
      if (here) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current');
    });
  });

  on('data', updateSwitcher);
  on('sync', updatePills);
  updateSwitcher();
  updatePills();
  setInterval(updatePills, 30000);   // keeps "Synced 2 min ago" fresh
}

function updateSwitcher() {
  const wrap = $('#acct-wrap');
  const select = $('#acct-switch');
  if (!wrap || !select) return;
  const accounts = activeAccounts();
  wrap.hidden = accounts.length < 2;
  const value = accounts.some(a => a.id === state.activeAccountId) ? state.activeAccountId : 'all';
  mount(select, html`<option value="all">All accounts</option>${accounts.map(a => html`<option value="${a.id}">${a.name}</option>`)}`);
  select.value = value;
}

function pillState() {
  const s = state.sync;
  if (s.status === 'syncing') return { key: 'syncing', text: 'Syncing' };
  if (s.status === 'offline' || !navigator.onLine) return { key: 'offline', text: s.pending ? `Offline, ${s.pending} waiting` : 'Offline' };
  if (s.status === 'error') return { key: 'error', text: s.pending ? `Sync failed, ${s.pending} waiting` : 'Sync failed' };
  if (s.failed) return { key: 'error', text: `${s.failed} change${s.failed > 1 ? 's' : ''} rejected` };
  if (s.pending) return { key: 'pending', text: `${s.pending} waiting` };
  return { key: 'ok', text: s.lastSync ? `Synced ${timeAgo(s.lastSync)}` : 'Not synced yet' };
}

function updatePills() {
  const p = pillState();
  $$('[data-sync-pill]').forEach(el => {
    el.dataset.state = p.key;
    el.textContent = p.text;
    el.title = state.sync.error || 'Tap to sync now';
  });
}
