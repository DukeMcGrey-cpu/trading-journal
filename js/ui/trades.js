// Trades list, trade detail page, and the shared row used here and on the dashboard.
import { html, mount, esc, money, signedMoney, plain, formatDateTime, formatDay, duration } from '../util.js';
import { state, on, visibleAccounts, timeZone } from '../store.js';
import { assetLabel, sessionLabel } from '../constants.js';
import { emptyState, typeChip } from './components.js';
import { icon } from './icons.js';
import { confirmDialog } from './dialog.js';
import { saveRecord } from '../sync.js';
import { toast } from '../util.js';
import { go } from '../router.js';

function accountOf(id) { return state.data.accounts.find(a => a.id === id); }
function instrumentOf(symbol) { return state.data.instruments.find(i => i.symbol === symbol); }

function statusChip(t) {
  if (t.status === 'OPEN') return html`<span class="chip chip-open">Open</span>`;
  if (t.status === 'CANCELLED') return html`<span class="chip">Cancelled</span>`;
  const cls = t.pnl > 0 ? 'chip-pos' : t.pnl < 0 ? 'chip-neg' : '';
  return html`<span class="chip ${cls}">${t.pnl > 0 ? 'Win' : t.pnl < 0 ? 'Loss' : 'Flat'}</span>`;
}

/** A single trade row, shared by the trades list and the dashboard's "Recent trades". */
export function tradeRow(t, { showAccount = false } = {}) {
  const dateIso = t.status === 'CLOSED' ? t.closeTime : t.openTime;
  const date = dateIso ? new Date(dateIso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const acct = showAccount ? accountOf(t.accountId) : null;
  return html`
    <a class="row trade-row" href="#/trade/${t.id}">
      <span class="row-main">
        <span class="row-title">${t.symbol} <span class="opt" style="font-weight:500">${t.direction === 'LONG' ? 'Long' : 'Short'}</span></span>
        <span class="row-sub">${date}${date ? ' · ' : ''}${plain(t.lots)} lot${Number(t.lots) === 1 ? '' : 's'}${acct ? ' · ' + acct.name : ''}</span>
      </span>
      <span class="row-end">
        ${t.status === 'CLOSED' ? html`<span class="trade-pnl ${t.pnl > 0 ? 'pos' : t.pnl < 0 ? 'neg' : ''}">${signedMoney(t.pnl)}</span>` : ''}
        ${statusChip(t)}
      </span>
    </a>`;
}

// ---------------------------------------------------------------- list

const filters = { q: '', status: 'ALL', market: 'ALL' };

function matchesFilters(t) {
  if (filters.status !== 'ALL' && t.status !== filters.status) return false;
  const inst = instrumentOf(t.symbol);
  if (filters.market !== 'ALL' && (!inst || inst.assetClass !== filters.market)) return false;
  if (filters.q) {
    const hay = `${t.symbol} ${t.strategyName || ''} ${t.tags || ''} ${t.notes || ''}`.toLowerCase();
    if (!hay.includes(filters.q.toLowerCase())) return false;
  }
  return true;
}

function listTemplate() {
  const ids = new Set(visibleAccounts().map(a => a.id));
  const own = t => t.deleted !== true && ids.has(t.accountId);
  const trades = state.data.trades.filter(own).filter(matchesFilters)
    .sort((a, b) => (b.closeTime || b.openTime || '').localeCompare(a.closeTime || a.openTime || ''));

  if (!state.data.trades.some(own)) {
    return emptyState({ icon: 'list', title: 'No trades yet', text: 'Log your first trade to start building your journal.', action: 'log-trade', actionLabel: 'Log trade' });
  }

  const markets = [...new Set(state.data.instruments.map(i => i.assetClass))];
  const showAccount = visibleAccounts().length > 1;

  return html`
    <div class="filter-bar">
      <input class="input filter-search" type="search" placeholder="Search symbol, strategy, notes" value="${filters.q}" data-filter="q" aria-label="Search trades">
      <select class="filter-select" data-filter="status" aria-label="Status">
        <option value="ALL"${filters.status === 'ALL' ? ' selected' : ''}>All statuses</option>
        <option value="OPEN"${filters.status === 'OPEN' ? ' selected' : ''}>Open</option>
        <option value="CLOSED"${filters.status === 'CLOSED' ? ' selected' : ''}>Closed</option>
      </select>
      <select class="filter-select" data-filter="market" aria-label="Market">
        <option value="ALL"${filters.market === 'ALL' ? ' selected' : ''}>All markets</option>
        ${markets.map(m => html`<option value="${m}"${filters.market === m ? ' selected' : ''}>${assetLabel(m)}</option>`)}
      </select>
    </div>
    ${trades.length ? html`<div class="list">${trades.map(t => tradeRow(t, { showAccount }))}</div>` : html`<p class="section-note">No trades match these filters.</p>`}`;
}

export function tradesView(outlet) {
  const draw = () => mount(outlet, listTemplate());

  outlet.onclick = e => {
    const btn = e.target.closest('[data-action="log-trade"]');
    if (btn) go('/trade/new');
  };
  outlet.oninput = e => {
    const f = e.target.closest('[data-filter="q"]');
    if (f) { filters.q = f.value; draw(); }
  };
  outlet.onchange = e => {
    const f = e.target.closest('[data-filter]');
    if (f && f.dataset.filter !== 'q') { filters[f.dataset.filter] = f.value; draw(); }
  };

  draw();
  const off = on('data', draw);
  return () => { off(); outlet.onclick = null; outlet.oninput = null; outlet.onchange = null; };
}

// ---------------------------------------------------------------- detail

function line(label, value) {
  if (value === null || value === undefined || value === '') return '';
  return html`<div class="calc-line"><dt>${label}</dt><dd>${value}</dd></div>`;
}

function detailTemplate(t) {
  const acct = accountOf(t.accountId);
  const tz = timeZone();
  const pnlClass = t.pnl > 0 ? 'pos' : t.pnl < 0 ? 'neg' : '';
  const strategy = t.strategyId ? state.data.strategies.find(s => s.id === t.strategyId) : null;

  return html`
    <div class="section" style="margin-top:0">
      <a class="btn btn-quiet btn-small" href="#/trades" style="margin-bottom:16px">${icon('back', 16)}<span>Trades</span></a>

      <div class="section-head" style="align-items:flex-start">
        <div>
          <h2 style="font-size:1.375rem">${t.symbol} <span class="opt" style="font-weight:500">${t.direction === 'LONG' ? 'Long' : 'Short'}</span></h2>
          ${t.status === 'CLOSED'
            ? html`<p class="balance-value" style="font-size:2rem;margin-top:4px"><span class="${pnlClass}">${signedMoney(t.pnl)}</span></p>`
            : html`<p style="margin-top:6px">${statusChip(t)}</p>`}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${t.status === 'OPEN' ? html`<a class="btn btn-quiet btn-small" href="#/trade/${t.id}/close">Close</a>` : ''}
          <a class="btn btn-quiet btn-small" href="#/trade/${t.id}/edit">${icon('edit', 16)}<span>Edit</span></a>
        </div>
      </div>

      <div class="calc-box">
        ${line('Account', acct ? acct.name : '—')}
        ${line('Lots', plain(t.lots))}
        ${line('Entry', plain(t.entry, 5))}
        ${t.status === 'CLOSED' ? line('Exit', plain(t.exit, 5)) : ''}
        ${line('Stop loss', t.stopLoss != null ? plain(t.stopLoss, 5) : null)}
        ${line('Take profit', t.takeProfit != null ? plain(t.takeProfit, 5) : null)}
        ${line('Leverage', t.leverage ? '1:' + plain(t.leverage) : null)}
        ${line('Margin used', t.margin != null ? money(t.margin) : null)}
        ${line('Risk', t.riskAmount != null ? `${money(t.riskAmount)} (${plain(t.riskPct, 2)}%)` : null)}
        ${line('Planned R:R', t.plannedRR != null ? '1 : ' + plain(t.plannedRR, 2) : null)}
        ${t.status === 'CLOSED' ? line('R multiple', t.rMultiple != null ? plain(t.rMultiple, 2) + 'R' : null) : ''}
        ${t.status === 'CLOSED' ? line('Fees / swap', `${money(t.fees || 0)} / ${signedMoney(t.swap || 0)}`) : ''}
        ${line('Opened', formatDateTime(t.openTime, tz))}
        ${t.status === 'CLOSED' ? line('Closed', formatDateTime(t.closeTime, tz)) : ''}
        ${t.status === 'CLOSED' && t.openTime && t.closeTime ? line('Held for', duration(t.openTime, t.closeTime)) : ''}
      </div>

      ${strategy || t.session || t.timeframe || t.followedPlan != null || t.rating || t.tags ? html`
        <div class="calc-box">
          ${line('Strategy', strategy ? strategy.name : null)}
          ${line('Session', t.session ? sessionLabel(t.session) : null)}
          ${line('Timeframe', t.timeframe)}
          ${line('Followed plan', t.followedPlan === true ? 'Yes' : t.followedPlan === false ? 'No' : null)}
          ${line('Rating', t.rating ? plain(t.rating) + ' / 5' : null)}
          ${line('Tags', t.tags)}
        </div>` : ''}

      ${t.notes ? html`<div class="section"><p class="hint">Notes</p><p>${esc(t.notes)}</p></div>` : ''}
      ${t.lesson ? html`<div class="section"><p class="hint">Lesson</p><p>${esc(t.lesson)}</p></div>` : ''}
      ${t.imgBefore || t.imgAfter ? html`
        <div class="section">
          <p class="hint" style="margin-bottom:8px">Screenshots</p>
          <div class="shot-grid" style="grid-template-columns:repeat(${t.imgBefore && t.imgAfter ? 2 : 1}, minmax(0,160px))">
            ${t.imgBefore ? html`<a class="shot-slot" style="border-style:solid" href="${t.imgBefore}" target="_blank" rel="noopener"><img src="${t.imgBefore}" alt="Before screenshot"></a>` : ''}
            ${t.imgAfter ? html`<a class="shot-slot" style="border-style:solid" href="${t.imgAfter}" target="_blank" rel="noopener"><img src="${t.imgAfter}" alt="After screenshot"></a>` : ''}
          </div>
        </div>` : ''}

      <div class="section">
        <button class="btn btn-quiet btn-danger-text" type="button" data-action="delete">${icon('trash', 16)}<span>Delete trade</span></button>
      </div>
    </div>`;
}

export function tradeDetailView(outlet, params) {
  const draw = () => {
    const t = state.data.trades.find(x => x.id === params.id && x.deleted !== true);
    if (!t) { mount(outlet, emptyState({ icon: 'list', title: 'Trade not found', text: 'It may have been deleted.', action: 'back-to-trades', actionLabel: 'Back to trades' })); return; }
    mount(outlet, detailTemplate(t));
  };

  outlet.onclick = async e => {
    if (e.target.closest('[data-action="back-to-trades"]')) { go('/trades'); return; }
    if (e.target.closest('[data-action="delete"]')) {
      const t = state.data.trades.find(x => x.id === params.id);
      const ok = await confirmDialog({ title: 'Delete this trade?', text: 'This removes it from your journal and statistics. This cannot be undone.', confirmLabel: 'Delete trade' });
      if (!ok || !t) return;
      await saveRecord('trades', { ...t, deleted: true });
      toast('Trade deleted');
      go('/trades');
    }
  };

  draw();
  const off = on('data', draw);
  return () => { off(); outlet.onclick = null; };
}
