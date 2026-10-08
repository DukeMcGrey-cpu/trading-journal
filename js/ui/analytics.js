// Analytics: KPI summary, an equity curve, and breakdowns by weekday, session, symbol, strategy
// and asset class — all computed client-side from the trades already synced to this device.
import { html, mount, raw, money, signedMoney, plain } from '../util.js';
import { state, on, visibleAccounts, timeZone } from '../store.js';
import { computeStats, groupBy } from '../stats.js';
import { assetLabel, sessionLabel } from '../constants.js';
import { emptyState } from './components.js';

function instrumentOf(symbol) { return state.data.instruments.find(i => i.symbol === symbol); }
function strategyOf(id) { return state.data.strategies.find(s => s.id === id); }

function weekdayOf(iso, tz) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(new Date(iso));
}
const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function pct(v) { return Number.isFinite(v) ? plain(v * 100, 1) + '%' : '—'; }
function ratio(v) { return v === Infinity ? '∞' : Number.isFinite(v) ? plain(v, 2) : '—'; }
function rMult(v) { return v === null || v === undefined ? '—' : plain(v, 2) + 'R'; }

function kpiGrid(s) {
  const cell = (label, value, cls = '') => html`<div><dt>${label}</dt><dd class="${cls}">${value}</dd></div>`;
  return html`
    <dl class="stats" style="margin-top:8px">
      ${cell('Net P&L', signedMoney(s.netPnl), s.netPnl > 0 ? 'pos' : s.netPnl < 0 ? 'neg' : '')}
      ${cell('Win rate', pct(s.winRate))}
      ${cell('Profit factor', ratio(s.profitFactor))}
      ${cell('Expectancy', signedMoney(s.expectancy))}
      ${cell('Avg R', rMult(s.avgR))}
      ${cell('Max drawdown', pct(s.maxDrawdown))}
    </dl>`;
}

function equitySvg(curve) {
  if (curve.length < 2) return null;
  const W = 600, H = 160, PAD = 8;
  const ys = curve.map(p => p.cumPnl);
  const minY = Math.min(0, ...ys), maxY = Math.max(0, ...ys);
  const range = (maxY - minY) || 1;
  const x = i => PAD + (i / (curve.length - 1)) * (W - PAD * 2);
  const y = v => H - PAD - ((v - minY) / range) * (H - PAD * 2);
  const points = curve.map((p, i) => `${x(i).toFixed(1)},${y(p.cumPnl).toFixed(1)}`).join(' ');
  const zeroY = y(0).toFixed(1);
  const last = ys[ys.length - 1];
  const color = last >= 0 ? 'var(--gain)' : 'var(--loss)';
  const area = `${x(0).toFixed(1)},${zeroY} ${points} ${x(curve.length - 1).toFixed(1)},${zeroY}`;
  return raw(`
    <svg viewBox="0 0 ${W} ${H}" class="equity-svg" preserveAspectRatio="none" aria-hidden="true">
      <line x1="${PAD}" y1="${zeroY}" x2="${W - PAD}" y2="${zeroY}" style="stroke:var(--line)" stroke-width="1"/>
      <polygon points="${area}" style="fill:${color}" opacity="0.12"/>
      <polyline points="${points}" fill="none" style="stroke:${color}" stroke-width="2"/>
    </svg>`);
}

function breakdownSection(title, groups, { max = 8 } = {}) {
  if (!groups.length) return '';
  const shown = groups.slice(0, max);
  const maxAbs = Math.max(1, ...shown.map(g => Math.abs(g.stats.netPnl)));
  return html`
    <section class="section" aria-label="${title}">
      <h2 style="font-size:1rem;margin-bottom:10px">${title}</h2>
      <div class="list">
        ${shown.map(g => {
          const pnl = g.stats.netPnl;
          const width = Math.max(4, Math.round((Math.abs(pnl) / maxAbs) * 100));
          const cls = pnl > 0 ? 'pos' : pnl < 0 ? 'neg' : '';
          return html`
            <div class="row static-row bar-row">
              <span class="row-main">
                <span class="row-title">${g.label}</span>
                <span class="row-sub">${g.stats.count} trade${g.stats.count === 1 ? '' : 's'} · ${pct(g.stats.winRate)} win rate</span>
                <span class="bar-track"><span class="bar-fill ${cls}" style="width:${width}%"></span></span>
              </span>
              <span class="row-end"><span class="trade-pnl ${cls}">${signedMoney(pnl)}</span></span>
            </div>`;
        })}
      </div>
      ${groups.length > max ? html`<p class="hint" style="margin-top:8px">Showing the top ${max} of ${groups.length}.</p>` : ''}
    </section>`;
}

function template() {
  const ids = new Set(visibleAccounts().map(a => a.id));
  const closed = state.data.trades
    .filter(t => t.status === 'CLOSED' && t.deleted !== true && ids.has(t.accountId))
    .sort((a, b) => (a.closeTime || '').localeCompare(b.closeTime || ''));

  if (!closed.length) {
    return emptyState({
      icon: 'chart',
      title: 'Charts appear once you have closed trades',
      text: 'You will see your equity curve, results by weekday, session, market and strategy, and your drawdown.'
    });
  }

  const tz = timeZone();
  const s = computeStats(closed);
  const curveHtml = equitySvg(s.equityCurve);

  const byWeekday = groupBy(closed, t => weekdayOf(t.closeTime, tz))
    .sort((a, b) => WEEKDAY_ORDER.indexOf(a.key) - WEEKDAY_ORDER.indexOf(b.key));
  const bySession = groupBy(closed, t => t.session || 'none', k => k === 'none' ? 'Not set' : sessionLabel(k));
  const bySymbol = groupBy(closed, t => t.symbol);
  const byStrategy = groupBy(closed, t => t.strategyId || 'none', k => k === 'none' ? 'No strategy' : (strategyOf(k)?.name || 'Unknown strategy'));
  const byAsset = groupBy(closed, t => instrumentOf(t.symbol)?.assetClass || null, assetLabel);

  return html`
    ${kpiGrid(s)}
    <p class="section-note" style="margin-top:14px">
      ${s.count} closed trade${s.count === 1 ? '' : 's'} · best ${money(s.best)} · worst ${money(s.worst)} ·
      longest win streak ${s.maxWinStreak} · longest losing streak ${s.maxLossStreak}
    </p>

    <section class="section" aria-label="Equity curve">
      <h2 style="font-size:1rem;margin-bottom:10px">Equity curve</h2>
      ${curveHtml ? html`<div class="card equity-card">${curveHtml}</div>` : html`<p class="section-note">Close one more trade to see a curve.</p>`}
    </section>

    ${breakdownSection('By weekday', byWeekday)}
    ${breakdownSection('By session', bySession)}
    ${breakdownSection('By market', byAsset)}
    ${breakdownSection('By symbol', bySymbol)}
    ${breakdownSection('By strategy', byStrategy)}
  `;
}

export function analyticsView(outlet) {
  const draw = () => mount(outlet, template());
  draw();
  return on('data', draw);
}
