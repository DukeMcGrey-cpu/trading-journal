// Log / edit / close trade — a full page (not a dialog) so it works well as a routed, back-button-able screen.
import { html, mount, $, $$, money, plain, uuid, toast, isoToLocalInput, localInputToIso } from '../util.js';
import { state, activeAccounts, timeZone, on } from '../store.js';
import { calcTrade, accountBalance, suggestLots, hasContractSize } from '../calc.js';
import { ASSET_CLASSES, SESSIONS, EMOTIONS, TIMEFRAMES, LOT_STEP, sessionOf } from '../constants.js';
import { saveRecord } from '../sync.js';
import { confirmDialog } from './dialog.js';
import { openInstrumentDialog, openStrategyDialog } from './forms.js';
import { icon } from './icons.js';
import { go } from '../router.js';

function instrumentOf(symbol) { return state.data.instruments.find(i => i.symbol === symbol); }
function accountOf(id) { return state.data.accounts.find(a => a.id === id); }
function strategyOptions(selected) {
  const list = state.data.strategies.filter(s => s.deleted !== true).sort((a, b) => a.name.localeCompare(b.name));
  return html`<option value="">No strategy</option>${list.map(s => html`<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${s.name}</option>`)}<option value="__new">+ Add strategy…</option>`;
}
function instrumentOptionsHtml(selected) {
  const groups = {};
  for (const i of state.data.instruments) { if (i.deleted === true) continue; (groups[i.assetClass] ||= []).push(i); }
  return ASSET_CLASSES.filter(a => groups[a.value]?.length).map(a => html`
    <optgroup label="${a.label}">
      ${groups[a.value].sort((x, y) => x.symbol.localeCompare(y.symbol)).map(i => html`<option value="${i.symbol}" ${i.symbol === selected ? 'selected' : ''}>${i.symbol}</option>`)}
    </optgroup>`);
}
function accountOptionsHtml(selected) {
  return activeAccounts().map(a => html`<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${a.name}</option>`);
}
function selectOptions(list, selected, allowEmpty = true) {
  return (allowEmpty ? `<option value=""></option>` : '') + list.map(v => `<option value="${v}"${v === selected ? ' selected' : ''}>${v}</option>`).join('');
}

/** mode: "new" | "edit" | "close". params.id identifies the trade for edit/close. */
export function tradeFormView(outlet, params, mode) {
  const accounts = activeAccounts();
  if (!accounts.length) {
    mount(outlet, html`<p class="section-note">Add an account first, from the dashboard or Settings, before logging a trade.</p>`);
    return;
  }

  const tz = timeZone();
  const editing = mode !== 'new';
  const source = editing ? state.data.trades.find(x => x.id === params.id && x.deleted !== true) : null;
  if (editing && !source) {
    mount(outlet, html`<p class="section-note">That trade could not be found. It may have been deleted.</p><a class="btn btn-quiet" href="#/trades">Back to trades</a>`);
    return;
  }

  const now = new Date().toISOString();
  const startAccountId = accounts.some(a => a.id === state.activeAccountId) ? state.activeAccountId : accounts[0].id;
  const t = source ? { ...source } : {
    id: uuid(), accountId: startAccountId,
    symbol: state.data.instruments.find(i => i.deleted !== true)?.symbol || '',
    direction: 'LONG', status: 'OPEN', lots: null, entry: null, exit: null, stopLoss: null, takeProfit: null,
    leverage: accountOf(startAccountId)?.defaultLeverage || 100,
    fxRateToAcct: null, fees: 0, swap: 0, pnlMode: 'AUTO', pnl: null,
    openTime: now, closeTime: now, strategyId: '', timeframe: '', session: sessionOf(now), emotionBefore: '', emotionAfter: '',
    followedPlan: true, rating: null, tags: '', notes: '', lesson: '',
    createdAt: now, deleted: false
  };
  if (mode === 'close' && t.status !== 'CLOSED') { t.status = 'CLOSED'; t.exit = t.exit ?? t.entry; t.closeTime = now; }

  function template() {
    const inst = instrumentOf(t.symbol);
    const acct = accountOf(t.accountId);
    const sized = hasContractSize(inst);
    const calc = calcTrade(t, inst, acct, state.data);
    const closed = t.status === 'CLOSED';
    const balance = acct ? accountBalance(acct, state.data) : 0;
    const overBalance = calc.margin != null && balance > 0 && calc.margin > balance;

    return html`
      <div class="section" style="margin-top:0">
        <a class="btn btn-quiet btn-small" href="#/trades" style="margin-bottom:16px">${icon('back', 16)}<span>Trades</span></a>

        <div class="card" style="display:grid;gap:16px">
          <div class="field">
            <label for="tf-account">Account</label>
            <select class="input" id="tf-account" data-f="accountId">${accountOptionsHtml(t.accountId)}</select>
          </div>

          <div class="field">
            <label for="tf-symbol">Instrument</label>
            <select class="input" id="tf-symbol" data-f="symbol">${instrumentOptionsHtml(t.symbol)}</select>
            ${!sized ? html`<p class="hint">This instrument has no contract size yet, so margin, risk and R multiple can't be calculated. <button type="button" class="btn btn-quiet btn-small" data-action="set-size" style="height:28px;padding:0 10px;margin-top:6px">Set contract size</button></p>` : ''}
          </div>

          <div class="field">
            <label id="dir-label">Direction</label>
            <div class="segmented" role="radiogroup" aria-labelledby="dir-label">
              <button type="button" role="radio" aria-checked="${t.direction === 'LONG'}" data-set="direction" data-value="LONG">Long</button>
              <button type="button" role="radio" aria-checked="${t.direction === 'SHORT'}" data-set="direction" data-value="SHORT">Short</button>
            </div>
          </div>

          <div class="field">
            <label id="status-label">Status</label>
            <div class="segmented" role="radiogroup" aria-labelledby="status-label">
              <button type="button" role="radio" aria-checked="${!closed}" data-set="status" data-value="OPEN">Open</button>
              <button type="button" role="radio" aria-checked="${closed}" data-set="status" data-value="CLOSED">Closed</button>
            </div>
          </div>

          <div class="field">
            <label for="tf-lots">Lots</label>
            <input class="input" id="tf-lots" type="number" step="any" min="0" inputmode="decimal" data-f="lots" value="${t.lots ?? ''}">
          </div>

          <div class="field">
            <label for="tf-entry">Entry price</label>
            <input class="input" id="tf-entry" type="number" step="any" data-f="entry" value="${t.entry ?? ''}">
          </div>

          <div class="field">
            <label for="tf-stop">Stop loss <span class="opt">(optional)</span></label>
            <input class="input" id="tf-stop" type="number" step="any" data-f="stopLoss" value="${t.stopLoss ?? ''}">
          </div>

          <div class="field">
            <label for="tf-take">Take profit <span class="opt">(optional)</span></label>
            <input class="input" id="tf-take" type="number" step="any" data-f="takeProfit" value="${t.takeProfit ?? ''}">
          </div>

          ${sized && t.stopLoss && t.entry && balance ? html`
            <button type="button" class="btn btn-quiet btn-small" data-action="suggest-lots" style="justify-self:start">Suggest lots for 1% risk</button>` : ''}

          <div class="field">
            <label for="tf-lev">Leverage</label>
            <input class="input" id="tf-lev" type="number" step="1" min="1" data-f="leverage" value="${t.leverage ?? ''}">
            <p class="hint">Enter 100 for 1:100.</p>
          </div>

          ${calc.rateNeeded ? html`
            <div class="field">
              <label for="tf-rate">${inst?.quoteCcy || 'Quote'} to USD rate</label>
              <input class="input" id="tf-rate" type="number" step="any" data-f="fxRateToAcct" value="${t.fxRateToAcct ?? ''}">
              <p class="hint">${inst?.symbol || 'This pair'} doesn't involve USD directly, so margin and P&amp;L need this rate. You can also switch P&amp;L to manual below.</p>
            </div>` : ''}

          <div class="calc-box" aria-live="polite">
            <div class="calc-line"><dt>Units</dt><dd>${calc.units != null ? plain(calc.units) : '—'}</dd></div>
            <div class="calc-line"><dt>Notional</dt><dd>${calc.notional != null ? money(calc.notional) : '—'}</dd></div>
            <div class="calc-line"><dt>Margin</dt><dd>${calc.margin != null ? money(calc.margin) : '—'}</dd></div>
            <div class="calc-line"><dt>Risk</dt><dd>${calc.riskAmount != null ? `${money(calc.riskAmount)} (${plain(calc.riskPct, 2)}%)` : '—'}</dd></div>
            <div class="calc-line"><dt>Planned R:R</dt><dd>${calc.plannedRR != null ? '1 : ' + plain(calc.plannedRR, 2) : '—'}</dd></div>
            ${overBalance ? html`<p class="calc-warn">Margin is more than the account balance.</p>` : ''}
          </div>

          <div class="field">
            <label for="tf-open">Opened</label>
            <input class="input" id="tf-open" type="datetime-local" step="60" data-f="openTime" value="${isoToLocalInput(t.openTime, tz)}">
          </div>

          ${closed ? html`
            <div class="field">
              <label for="tf-exit">Exit price</label>
              <input class="input" id="tf-exit" type="number" step="any" data-f="exit" value="${t.exit ?? ''}">
            </div>
            <div class="field">
              <label for="tf-close">Closed</label>
              <input class="input" id="tf-close" type="datetime-local" step="60" data-f="closeTime" value="${isoToLocalInput(t.closeTime, tz)}">
            </div>
            <div class="field">
              <label id="pnl-label">Profit or loss</label>
              <div class="segmented" role="radiogroup" aria-labelledby="pnl-label">
                <button type="button" role="radio" aria-checked="${t.pnlMode !== 'MANUAL'}" data-set="pnlMode" data-value="AUTO">Calculate</button>
                <button type="button" role="radio" aria-checked="${t.pnlMode === 'MANUAL'}" data-set="pnlMode" data-value="MANUAL">Enter manually</button>
              </div>
            </div>
            ${t.pnlMode === 'MANUAL' ? html`
              <div class="field">
                <label for="tf-pnl">Net profit or loss (USD)</label>
                <input class="input" id="tf-pnl" type="number" step="any" data-f="pnl" value="${t.pnl ?? ''}">
              </div>` : html`
              <div class="field">
                <label for="tf-fees">Fees</label>
                <input class="input" id="tf-fees" type="number" step="any" min="0" data-f="fees" value="${t.fees ?? 0}">
              </div>
              <div class="field">
                <label for="tf-swap">Swap</label>
                <input class="input" id="tf-swap" type="number" step="any" data-f="swap" value="${t.swap ?? 0}">
              </div>
              <div class="calc-box">
                <div class="calc-line"><dt>Net P&amp;L</dt><dd>${calc.pnl != null ? money(calc.pnl) : '—'}</dd></div>
                <div class="calc-line"><dt>R multiple</dt><dd>${calc.rMultiple != null ? plain(calc.rMultiple, 2) + 'R' : '—'}</dd></div>
              </div>`}
            <div class="field">
              <label for="tf-emo-after">How did you feel after? <span class="opt">(optional)</span></label>
              <select class="input" id="tf-emo-after" data-f="emotionAfter">${selectOptions(EMOTIONS, t.emotionAfter)}</select>
            </div>
            <div class="field">
              <label for="tf-lesson">Lesson <span class="opt">(optional)</span></label>
              <textarea class="input" id="tf-lesson" rows="2" data-f="lesson">${t.lesson || ''}</textarea>
            </div>` : ''}
        </div>

        <div class="card" style="display:grid;gap:16px;margin-top:16px">
          <p class="group-title" style="margin:0">Plan and notes</p>
          <div class="field">
            <label for="tf-strategy">Strategy <span class="opt">(optional)</span></label>
            <select class="input" id="tf-strategy" data-f="strategyId">${strategyOptions(t.strategyId)}</select>
          </div>
          <div class="field">
            <label for="tf-session">Session <span class="opt">(optional)</span></label>
            <select class="input" id="tf-session" data-f="session">${selectOptions(SESSIONS.map(s => s.value), t.session)}</select>
          </div>
          <div class="field">
            <label for="tf-timeframe">Timeframe <span class="opt">(optional)</span></label>
            <select class="input" id="tf-timeframe" data-f="timeframe">${selectOptions(TIMEFRAMES, t.timeframe)}</select>
          </div>
          <div class="field">
            <label for="tf-emo-before">How did you feel before? <span class="opt">(optional)</span></label>
            <select class="input" id="tf-emo-before" data-f="emotionBefore">${selectOptions(EMOTIONS, t.emotionBefore)}</select>
          </div>
          <div class="field field-check">
            <label class="check"><input type="checkbox" id="tf-plan" data-f="followedPlan" ${t.followedPlan !== false ? 'checked' : ''}><span>I followed my plan on this trade</span></label>
          </div>
          <div class="field">
            <label for="tf-rating">Execution rating <span class="opt">(optional, 1 to 5)</span></label>
            <input class="input" id="tf-rating" type="number" min="1" max="5" step="1" data-f="rating" value="${t.rating ?? ''}">
          </div>
          <div class="field">
            <label for="tf-tags">Tags <span class="opt">(optional, comma separated)</span></label>
            <input class="input" id="tf-tags" data-f="tags" value="${t.tags || ''}">
          </div>
          <div class="field">
            <label for="tf-notes">Notes <span class="opt">(optional)</span></label>
            <textarea class="input" id="tf-notes" rows="3" data-f="notes">${t.notes || ''}</textarea>
          </div>
        </div>

        <p class="form-error" role="alert" hidden style="margin-top:14px"></p>

        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;flex-wrap:wrap">
          ${editing ? html`<button type="button" class="btn btn-quiet btn-danger-text" data-action="delete" style="margin-right:auto">${icon('trash', 16)}<span>Delete</span></button>` : ''}
          <a class="btn btn-quiet" href="#/trades">Cancel</a>
          <button type="button" class="btn btn-primary" data-action="save">${mode === 'close' ? 'Close trade' : editing ? 'Save changes' : 'Log trade'}</button>
        </div>
      </div>`;
  }

  let stopped = false;

  function redraw(preserveFocus = true) {
    if (stopped) return;
    const active = document.activeElement;
    const activeName = preserveFocus && active && active.dataset ? active.dataset.f : null;
    const selStart = activeName && 'selectionStart' in active ? active.selectionStart : null;
    mount(outlet, template());
    bind();
    if (activeName) {
      const el = outlet.querySelector(`[data-f="${activeName}"]`);
      if (el) { el.focus(); if (selStart != null && el.setSelectionRange) { try { el.setSelectionRange(selStart, selStart); } catch { /* not a text field */ } } }
    }
  }

  function readField(el) {
    const name = el.dataset.f;
    if (!name) return;
    if (el.type === 'checkbox') t[name] = el.checked;
    else if (el.type === 'number') t[name] = el.value === '' ? null : Number(el.value);
    else if (el.type === 'datetime-local') t[name] = localInputToIso(el.value, tz);
    else t[name] = el.value;
  }

  function bind() {
    $$('[data-f]', outlet).forEach(el => {
      const evt = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
      el.addEventListener(evt, async () => {
        if (el.dataset.f === 'strategyId' && el.value === '__new') {
          const rec = await openStrategyDialog();
          t.strategyId = rec ? rec.id : '';
          redraw(false);
          return;
        }
        readField(el);
        redraw(evt === 'input');
      });
    });
    $$('[data-set]', outlet).forEach(btn => btn.addEventListener('click', () => {
      const { set, value } = btn.dataset;
      t[set] = value;
      if (set === 'status' && value === 'CLOSED' && !t.exit) t.exit = t.entry;
      redraw(false);
    }));
    const setSizeBtn = outlet.querySelector('[data-action="set-size"]');
    if (setSizeBtn) setSizeBtn.addEventListener('click', async () => { await openInstrumentDialog(instrumentOf(t.symbol)); redraw(false); });
    const suggestBtn = outlet.querySelector('[data-action="suggest-lots"]');
    if (suggestBtn) suggestBtn.addEventListener('click', () => {
      const acct = accountOf(t.accountId);
      const inst = instrumentOf(t.symbol);
      const lots = suggestLots(accountBalance(acct, state.data), 1, t.entry, t.stopLoss, inst);
      if (!lots) { toast('Not enough information to suggest a lot size yet.', 'error'); return; }
      const step = LOT_STEP[inst?.assetClass] || 0.01;
      t.lots = Math.max(step, Math.floor(lots / step) * step);
      redraw(false);
    });
    const saveBtn = outlet.querySelector('[data-action="save"]');
    if (saveBtn) saveBtn.addEventListener('click', onSave);
    const delBtn = outlet.querySelector('[data-action="delete"]');
    if (delBtn) delBtn.addEventListener('click', onDelete);
  }

  function showError(msg) {
    const el = outlet.querySelector('.form-error');
    if (el) { el.textContent = msg; el.hidden = !msg; }
  }

  function validate() {
    if (!t.symbol) return 'Choose an instrument.';
    if (!t.lots || t.lots <= 0) return 'Enter the number of lots.';
    if (!t.entry) return 'Enter the entry price.';
    if (!t.leverage || t.leverage <= 0) return 'Enter a leverage of 1 or more.';
    const inst = instrumentOf(t.symbol);
    const calc = calcTrade(t, inst, accountOf(t.accountId), state.data);
    if (t.status === 'CLOSED') {
      if (!t.exit) return 'Enter the exit price.';
      if (t.pnlMode === 'MANUAL' && (t.pnl === null || t.pnl === undefined)) return 'Enter the profit or loss, or switch to Calculate.';
      if (t.pnlMode === 'AUTO' && calc.rateNeeded && hasContractSize(inst)) return `Enter the ${inst.quoteCcy || 'quote'} to USD rate, or switch P&L to manual.`;
    }
    return '';
  }

  async function onSave() {
    const problem = validate();
    if (problem) { showError(problem); return; }
    showError('');
    const inst = instrumentOf(t.symbol);
    const acct = accountOf(t.accountId);
    const calc = calcTrade(t, inst, acct, state.data);
    const record = { ...t, ...calc };
    delete record.rateNeeded; delete record.rateUsed;
    await saveRecord('trades', record);
    toast(mode === 'close' ? 'Trade closed' : editing ? 'Trade saved' : 'Trade logged');
    go(`/trade/${record.id}`);
  }

  async function onDelete() {
    const ok = await confirmDialog({ title: 'Delete this trade?', text: 'This cannot be undone.', confirmLabel: 'Delete trade' });
    if (!ok) return;
    await saveRecord('trades', { ...t, deleted: true });
    toast('Trade deleted');
    go('/trades');
  }

  redraw(false);
  const off = on('data', () => redraw(true));
  return () => { stopped = true; off(); };
}
