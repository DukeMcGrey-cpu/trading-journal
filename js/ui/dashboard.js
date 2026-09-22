import { html, mount, money, signedMoney, plain } from '../util.js';
import { state, on, activeAccounts, visibleAccounts } from '../store.js';
import { accountBalance, summarize } from '../calc.js';
import { emptyState, typeChip } from './components.js';
import { openAccountDialog } from './forms.js';
import { icon } from './icons.js';
import { tradeRow } from './trades.js';

function accountCard(a) {
  return html`
    <li class="acct-card" data-type="${a.type || 'LIVE'}">
      <div class="acct-top">
        <span class="acct-name">${a.name}</span>
        ${typeChip(a.type)}
      </div>
      <p class="acct-balance">${money(accountBalance(a, state.data))}</p>
      <div class="acct-meta">
        <span>Started with ${money(a.startBalance)}</span>
        ${a.defaultLeverage ? html`<span>Leverage 1:${plain(a.defaultLeverage)}</span>` : ''}
        ${a.broker ? html`<span>${a.broker}</span>` : ''}
      </div>
    </li>`;
}

function template() {
  if (!activeAccounts().length) {
    return emptyState({
      icon: 'wallet',
      title: 'Add your first account',
      text: 'An account holds your balance, leverage and every trade you log. You can add demo, live and prop accounts and switch between them.',
      action: 'add-account',
      actionLabel: 'Add account'
    });
  }

  const shown = visibleAccounts();
  const total = shown.reduce((sum, a) => sum + accountBalance(a, state.data), 0);
  const stats = summarize(state.data, shown);
  const needSize = state.data.instruments.filter(i => i.contractSize === null || i.contractSize === undefined);
  const single = state.activeAccountId !== 'all' && shown.length === 1;
  const ids = new Set(shown.map(a => a.id));
  const when = t => Date.parse(t.status === 'CLOSED' ? t.closeTime : t.openTime) || 0;
  const recent = state.data.trades.filter(t => ids.has(t.accountId)).sort((a, b) => when(b) - when(a)).slice(0, 5);

  return html`
    <section class="balance" aria-label="Balance">
      <p class="balance-label">${single ? shown[0].name : 'Total balance'}</p>
      <p class="balance-value">${money(total)}</p>
      <dl class="stats">
        <div><dt>Closed trades</dt><dd>${stats.closed}</dd></div>
        <div><dt>Open trades</dt><dd>${stats.open}</dd></div>
        <div><dt>Net result</dt><dd class="${stats.netPnl > 0 ? 'pos' : stats.netPnl < 0 ? 'neg' : ''}">${signedMoney(stats.netPnl)}</dd></div>
      </dl>
    </section>

    ${needSize.length ? html`
      <a class="notice" href="#/settings">
        ${icon('alert', 20)}
        <span><strong>${needSize.length} instrument${needSize.length > 1 ? 's need' : ' needs'} a contract size</strong> before margin and risk can be calculated. Open Settings to add them.</span>
      </a>` : ''}

    <section class="section" aria-labelledby="acct-h">
      <div class="section-head">
        <h2 id="acct-h">Accounts</h2>
        <button class="btn btn-quiet btn-small" type="button" data-action="add-account">Add account</button>
      </div>
      <ul class="cards">${shown.map(accountCard)}</ul>
    </section>

    <section class="section" aria-labelledby="recent-h">
      <div class="section-head">
        <h2 id="recent-h">Recent trades</h2>
        ${recent.length ? html`<a class="btn btn-quiet btn-small" href="#/trades">See all</a>` : ''}
      </div>
      ${recent.length
        ? html`<div class="list">${recent.map(t => tradeRow(t, { showAccount: shown.length > 1 }))}</div>`
        : html`<div class="card empty-inline"><p>Nothing logged yet. Your first trade shows up here with its margin, risk and result.</p><a class="btn btn-primary" href="#/trade/new">Log a trade</a></div>`}
    </section>`;
}

export function dashboardView(outlet) {
  const draw = () => mount(outlet, template());
  outlet.onclick = e => {
    const btn = e.target.closest('[data-action]');
    if (btn && btn.dataset.action === 'add-account') openAccountDialog();
  };
  draw();
  const off = on('data', draw);
  return () => { off(); outlet.onclick = null; };
}
