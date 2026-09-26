import { html, mount, plain, toast, deviceTimeZone, timeAgo } from '../util.js';
import { APP_VERSION } from '../config.js';
import { state, on, activeAccounts, archivedAccounts } from '../store.js';
import { syncNow, fullRefresh, saveSettings, failedOps, discardOp } from '../sync.js';
import { clearSession } from '../api.js';
import { clearEverything } from '../db.js';
import { applyTheme, currentTheme } from './theme.js';
import { typeChip } from './components.js';
import { confirmDialog } from './dialog.js';
import { openAccountDialog, openInstrumentDialog, openStrategyDialog } from './forms.js';
import { ASSET_CLASSES } from '../constants.js';

function accountRow(a) {
  return html`
    <button class="row" type="button" data-action="edit-account" data-id="${a.id}">
      <span class="row-main">
        <span class="row-title">${a.name}</span>
        <span class="row-sub">${[a.broker, a.defaultLeverage ? `Leverage 1:${plain(a.defaultLeverage)}` : ''].filter(Boolean).join(', ') || 'No broker set'}</span>
      </span>
      <span class="row-end">${typeChip(a.type)}</span>
    </button>`;
}

function instrumentRow(i) {
  const missing = i.contractSize === null || i.contractSize === undefined;
  return html`
    <button class="row" type="button" data-action="edit-instrument" data-id="${i.symbol}">
      <span class="row-main">
        <span class="row-title">${i.symbol}</span>
        <span class="row-sub">${missing ? 'No contract size yet' : `${plain(i.contractSize)} per lot`}</span>
      </span>
      <span class="row-end">
        ${missing ? html`<span class="chip chip-warn">Set contract size</span>`
          : i.verified === true ? html`<span class="chip chip-ok">Checked</span>`
          : html`<span class="chip">Not checked</span>`}
      </span>
    </button>`;
}

function strategyRow(st) {
  return html`
    <button class="row" type="button" data-action="edit-strategy" data-id="${st.id}">
      <span class="row-main">
        <span class="row-title">${st.name}</span>
        <span class="row-sub">${st.description || 'No description'}</span>
      </span>
    </button>`;
}

function timeZoneOptions() {
  const zones = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return ['auto', ...zones];
}

function themeSection() {
  const mode = currentTheme();
  const btn = (value, label) => html`<button type="button" role="radio" aria-checked="${String(mode === value)}" data-action="theme" data-value="${value}">${label}</button>`;
  return html`
    <div class="setting-line">
      <div><h3>Theme</h3><p class="hint">System follows your device setting.</p></div>
      <div class="segmented" role="radiogroup" aria-label="Theme">${btn('system', 'System')}${btn('light', 'Light')}${btn('dark', 'Dark')}</div>
    </div>`;
}

function template() {
  const accounts = activeAccounts();
  const archived = archivedAccounts();
  const tz = state.data.settings.timezone || 'auto';
  const instruments = [...state.data.instruments].sort((a, b) => a.symbol.localeCompare(b.symbol));
  const strategies = [...state.data.strategies].sort((a, b) => String(a.name).localeCompare(String(b.name)));

  return html`
    <div class="settings">
      <section class="section" style="margin-top:8px">
        <div class="card">${themeSection()}</div>
      </section>

      <section class="section" aria-labelledby="s-acct">
        <div class="section-head"><h2 id="s-acct">Accounts</h2><button class="btn btn-quiet btn-small" type="button" data-action="add-account">Add account</button></div>
        ${accounts.length ? html`<div class="list">${accounts.map(accountRow)}</div>` : html`<p class="section-note">No accounts yet. Add one to start logging trades.</p>`}
        ${archived.length ? html`
          <p class="group-title">Archived</p>
          <div class="list">${archived.map(accountRow)}</div>` : ''}
      </section>

      <section class="section" aria-labelledby="s-inst">
        <div class="section-head"><h2 id="s-inst">Instruments</h2><button class="btn btn-quiet btn-small" type="button" data-action="add-instrument">Add instrument</button></div>
        <p class="section-note">Contract size is the number of units in one lot. It differs between brokers, so check yours and enter it here. Margin, risk and profit are calculated from it.</p>
        ${ASSET_CLASSES.map(ac => {
          const rows = instruments.filter(i => i.assetClass === ac.value);
          return rows.length ? html`<p class="group-title">${ac.label}</p><div class="list">${rows.map(instrumentRow)}</div>` : '';
        })}
      </section>

      <section class="section" aria-labelledby="s-strat">
        <div class="section-head"><h2 id="s-strat">Strategies</h2><button class="btn btn-quiet btn-small" type="button" data-action="add-strategy">Add strategy</button></div>
        <p class="section-note">Name the setups you trade. Tag each trade with one, and Improve will show which ones actually pay.</p>
        ${strategies.length ? html`<div class="list">${strategies.map(strategyRow)}</div>` : html`<p class="section-note">No strategies yet.</p>`}
      </section>

      <section class="section" aria-labelledby="s-day">
        <h2 id="s-day" style="margin-bottom:12px">Day and time</h2>
        <div class="card">
          <div class="field">
            <label for="tz">Timezone for your trading day</label>
            <input class="input" id="tz" list="tz-list" value="${tz}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-describedby="tz-hint">
            <datalist id="tz-list">${timeZoneOptions().map(z => html`<option value="${z}"></option>`)}</datalist>
            <p class="hint" id="tz-hint">Trade times are entered and shown in this timezone, and each trade counts toward the day it closed. "auto" follows this device (${deviceTimeZone()}). Pick a fixed zone such as Asia/Manila to keep your calendar steady when you travel.</p>
          </div>
        </div>
      </section>

      <section class="section" aria-labelledby="s-sync">
        <h2 id="s-sync" style="margin-bottom:12px">Sync</h2>
        <div class="card" id="sync-card"></div>
      </section>

      <section class="section" aria-labelledby="s-session">
        <h2 id="s-session" style="margin-bottom:12px">This device</h2>
        <div class="card danger-zone">
          <p class="hint">Signing out removes your passphrase and the local copy of your data from this device. Your Google Sheet is not changed.</p>
          <button class="btn btn-quiet btn-danger-text" type="button" data-action="sign-out">Sign out</button>
          <p class="hint">Version ${APP_VERSION}</p>
        </div>
      </section>
    </div>`;
}

async function drawSync(host) {
  const s = state.sync;
  const failed = await failedOps();
  const status = s.status === 'syncing' ? 'Syncing now.'
    : s.status === 'offline' ? 'You are offline. Changes are saved on this device and will send when you reconnect.'
    : s.status === 'error' ? `The last sync failed: ${s.error || 'unknown error'}.`
    : s.lastSync ? `Last synced ${timeAgo(s.lastSync)}.` : 'Not synced yet.';
  mount(host, html`
    <p>${status}</p>
    <p class="hint" style="margin-top:4px">${s.pending ? `${s.pending} change${s.pending > 1 ? 's' : ''} waiting to send.` : 'Nothing waiting to send.'}</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
      <button class="btn btn-quiet btn-small" type="button" data-action="sync-now">Sync now</button>
      <button class="btn btn-quiet btn-small" type="button" data-action="full-refresh">Reload everything from the Sheet</button>
    </div>
    ${failed.length ? html`
      <p class="group-title" style="margin-top:20px">Changes the server rejected</p>
      <div class="list">
        ${failed.map(op => html`
          <div class="fail-item static-row">
            <span class="row-title">${op.action === 'image.upload' ? 'Screenshot upload' : op.action.replace('.upsert', '') + ' ' + String(op.key)}</span>
            <p>${op.error || 'Rejected'}</p>
            <div><button class="btn btn-quiet btn-small" type="button" data-action="discard-op" data-id="${op.opId}">Discard</button></div>
          </div>`)}
      </div>` : ''}`);
}

function textFieldFocused(outlet) {
  const el = document.activeElement;
  return outlet.contains(el) && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName);
}

export function settingsView(outlet) {
  const draw = () => {
    mount(outlet, template());
    drawSync(outlet.querySelector('#sync-card'));
  };

  outlet.onclick = async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id, value } = btn.dataset;

    if (action === 'theme') {
      applyTheme(value);
      await saveSettings({ theme: value });
      draw();
    } else if (action === 'add-account') openAccountDialog();
    else if (action === 'edit-account') openAccountDialog(state.data.accounts.find(a => a.id === id));
    else if (action === 'add-strategy') openStrategyDialog();
    else if (action === 'edit-strategy') openStrategyDialog(state.data.strategies.find(x => x.id === id));
    else if (action === 'add-instrument') openInstrumentDialog();
    else if (action === 'edit-instrument') openInstrumentDialog(state.data.instruments.find(i => i.symbol === id));
    else if (action === 'sync-now') { await syncNow(); if (state.sync.status === 'idle') toast('Up to date'); }
    else if (action === 'full-refresh') { await fullRefresh(); if (state.sync.status === 'idle') toast('Reloaded from the Sheet'); }
    else if (action === 'discard-op') { await discardOp(Number(id)); drawSync(outlet.querySelector('#sync-card')); }
    else if (action === 'sign-out') {
      const ok = await confirmDialog({
        title: 'Sign out of this device?',
        text: 'Your passphrase and the local copy of your data will be removed from this device. Anything not yet sent to the Sheet will be lost.',
        confirmLabel: 'Sign out'
      });
      if (!ok) return;
      clearSession();
      await clearEverything();
      localStorage.removeItem('tj_account');
      location.hash = '';
      location.reload();
    }
  };

  outlet.onchange = async e => {
    if (e.target.id !== 'tz') return;
    const v = e.target.value.trim() || 'auto';
    if (v !== 'auto') {
      try { new Intl.DateTimeFormat('en-US', { timeZone: v }); }
      catch { toast('That timezone name was not recognised. Try a name like Asia/Manila.', 'error'); e.target.value = state.data.settings.timezone || 'auto'; return; }
    }
    await saveSettings({ timezone: v });
    toast('Timezone saved');
  };

  draw();
  const offData = on('data', () => { if (!textFieldFocused(outlet)) draw(); });
  const offSync = on('sync', () => { const host = outlet.querySelector('#sync-card'); if (host) drawSync(host); });
  return () => { offData(); offSync(); outlet.onclick = null; outlet.onchange = null; };
}
