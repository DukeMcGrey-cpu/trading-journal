// Trading calendar: a month grid of daily net P&L (Monday-start weeks, matching util.js's
// weekStartKey), with a weekly subtotal under each row and a day drawer listing that day's trades.
import { html, mount, raw, signedMoney, dateKey, addDaysKey, weekStartKey, formatDay } from '../util.js';
import { state, on, visibleAccounts, timeZone } from '../store.js';
import { icon } from './icons.js';
import { tradeRow } from './trades.js';
import { emptyState } from './components.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad2 = n => String(n).padStart(2, '0');

let cursorKey = null; // "YYYY-MM-01" of the month currently shown; set to the current month on first render

function daysInMonth(year, month1) { return new Date(Date.UTC(year, month1, 0)).getUTCDate(); }
function diffDays(a, b) { return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000); }
function monthLabel(key) {
  return new Date(key + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function shiftMonthKey(key, delta) {
  const [y, m] = key.split('-').map(Number);
  let ny = y, nm = m + delta;
  if (nm < 1) { nm = 12; ny--; } else if (nm > 12) { nm = 1; ny++; }
  return `${ny}-${pad2(nm)}-01`;
}

/** Full weeks (Monday-start) of day-keys covering the month, with padding from adjacent months. */
function gridDays(monthFirstKey) {
  const [y, m] = monthFirstKey.split('-').map(Number);
  const lastKey = `${y}-${pad2(m)}-${pad2(daysInMonth(y, m))}`;
  const gridStart = weekStartKey(monthFirstKey);
  const lastWeekStart = weekStartKey(lastKey);
  const weeks = diffDays(gridStart, lastWeekStart) / 7 + 1;
  return Array.from({ length: weeks * 7 }, (_, i) => addDaysKey(gridStart, i));
}

function dayStats(trades, tz) {
  const byDay = new Map();
  for (const t of trades) {
    if (t.status !== 'CLOSED' || t.deleted === true || !t.closeTime) continue;
    const key = dateKey(t.closeTime, tz);
    const cur = byDay.get(key) || { pnl: 0, count: 0 };
    cur.pnl += Number(t.pnl) || 0;
    cur.count += 1;
    byDay.set(key, cur);
  }
  return byDay;
}

function cellTemplate(key, monthFirstKey, byDay, todayKey) {
  const inMonth = key.slice(0, 7) === monthFirstKey.slice(0, 7);
  const stat = byDay.get(key);
  const dayNum = Number(key.slice(8, 10));
  const cls = ['cal-cell'];
  if (!inMonth) cls.push('dim');
  if (key === todayKey) cls.push('today');
  if (stat && inMonth) cls.push(stat.pnl > 0 ? 'win' : stat.pnl < 0 ? 'loss' : '');
  const label = stat ? `${formatDay(key)}: ${stat.count} trade${stat.count === 1 ? '' : 's'}, ${signedMoney(stat.pnl)}` : formatDay(key);
  return html`
    <button type="button" class="${cls.filter(Boolean).join(' ')}" data-day="${key}" aria-label="${label}" ${stat ? '' : 'disabled'}>
      <span class="d-num">${dayNum}</span>
      ${stat ? html`<span class="d-pnl">${signedMoney(stat.pnl)}</span><span class="d-count">${stat.count} trade${stat.count === 1 ? '' : 's'}</span>` : ''}
    </button>`;
}

function template() {
  const tz = timeZone();
  const ids = new Set(visibleAccounts().map(a => a.id));
  const trades = state.data.trades.filter(t => ids.has(t.accountId));
  const todayKey = dateKey(new Date().toISOString(), tz);
  if (!cursorKey) cursorKey = todayKey.slice(0, 7) + '-01';

  if (!trades.some(t => t.status === 'CLOSED' && t.deleted !== true)) {
    return emptyState({
      icon: 'calendar',
      title: 'Your calendar fills in as you close trades',
      text: 'Each day shows its net result and number of trades, with a total for every week and month.'
    });
  }

  const byDay = dayStats(trades, tz);
  const days = gridDays(cursorKey);
  const monthPart = cursorKey.slice(0, 7);

  let monthTotal = 0, monthCount = 0;
  for (const key of days) {
    if (key.slice(0, 7) !== monthPart) continue;
    const s = byDay.get(key);
    if (s) { monthTotal += s.pnl; monthCount += s.count; }
  }

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return html`
    <div class="cal-nav">
      <button type="button" class="icon-btn" data-action="prev-month" aria-label="Previous month">${icon('back', 20)}</button>
      <h2>${monthLabel(cursorKey)}</h2>
      <button type="button" class="icon-btn" data-action="next-month" aria-label="Next month">${icon('chevron', 20)}</button>
    </div>
    <p class="cal-totals">
      ${monthCount} trade${monthCount === 1 ? '' : 's'} ·
      <span class="${monthTotal > 0 ? 'pos' : monthTotal < 0 ? 'neg' : ''}">${signedMoney(monthTotal)}</span>
      ${cursorKey !== todayKey.slice(0, 7) + '-01' ? html`<button type="button" class="btn btn-quiet btn-small" data-action="today" style="margin-left:10px">Today</button>` : ''}
    </p>
    <div class="cal-grid">
      ${DOW.map(d => html`<div class="cal-dow">${d}</div>`)}
      ${weeks.map(week => {
        const weekTotal = week.reduce((sum, key) => sum + (byDay.get(key)?.pnl || 0), 0);
        const weekCount = week.reduce((sum, key) => sum + (byDay.get(key)?.count || 0), 0);
        return html`
          ${week.map(key => cellTemplate(key, cursorKey, byDay, todayKey))}
          ${weekCount ? html`<div class="cal-week-total">Week: ${signedMoney(weekTotal)}</div>` : raw('<div class="cal-week-total"></div>')}`;
      })}
    </div>`;
}

function closeIcon() { return icon('x', 20); }

function openDayDrawer(key, trades) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  const total = trades.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
  const showAccount = visibleAccounts().length > 1;

  mount(dlg, html`
    <div class="sheet-form">
      <header class="sheet-head">
        <h2>${formatDay(key)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close">${closeIcon()}</button>
      </header>
      <p class="sheet-desc">
        ${trades.length} trade${trades.length === 1 ? '' : 's'} ·
        <span class="${total > 0 ? 'pos' : total < 0 ? 'neg' : ''}">${signedMoney(total)}</span>
      </p>
      <div class="sheet-body">
        <div class="list">${trades.map(t => tradeRow(t, { showAccount }))}</div>
      </div>
    </div>`);

  document.body.appendChild(dlg);
  dlg.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => dlg.close()));
  dlg.addEventListener('click', e => {
    if (e.target === dlg) { dlg.close(); return; }
    if (e.target.closest('a.trade-row')) dlg.close(); // let the link navigate; just get the drawer out of the way
  });
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
}

export function calendarView(outlet) {
  const draw = () => mount(outlet, template());

  outlet.onclick = e => {
    const btn = e.target.closest('[data-action]');
    if (btn) {
      if (btn.dataset.action === 'prev-month') { cursorKey = shiftMonthKey(cursorKey, -1); draw(); }
      else if (btn.dataset.action === 'next-month') { cursorKey = shiftMonthKey(cursorKey, 1); draw(); }
      else if (btn.dataset.action === 'today') { cursorKey = dateKey(new Date().toISOString(), timeZone()).slice(0, 7) + '-01'; draw(); }
      return;
    }
    const cell = e.target.closest('[data-day]');
    if (cell && !cell.disabled) {
      const key = cell.dataset.day;
      const tz = timeZone();
      const ids = new Set(visibleAccounts().map(a => a.id));
      const dayTrades = state.data.trades
        .filter(t => t.status === 'CLOSED' && t.deleted !== true && ids.has(t.accountId) && dateKey(t.closeTime, tz) === key)
        .sort((a, b) => (b.closeTime || '').localeCompare(a.closeTime || ''));
      openDayDrawer(key, dayTrades);
    }
  };

  draw();
  const off = on('data', draw);
  return () => { off(); outlet.onclick = null; };
}
