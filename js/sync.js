// Offline-first sync.
//  - Every change is saved locally first (instant UI), then queued in the outbox.
//  - The outbox is sent to Apps Script in order; the server then returns the stamped record.
//  - A pull (bootstrap) refreshes local data from the Sheet without overwriting unsent local edits.

import * as db from './db.js';
import { callApi } from './api.js';
import { state, emit } from './store.js';
import { SYNC_INTERVAL_MS, SYNC_OVERLAP_MS } from './config.js';

const KEYS = { accounts: 'id', instruments: 'symbol', strategies: 'id', cashflows: 'id', reviews: 'id', trades: 'id' };
const ACTIONS = {
  accounts: 'account.upsert',
  instruments: 'instrument.upsert',
  strategies: 'strategy.upsert',
  cashflows: 'cashflow.upsert',
  reviews: 'review.upsert',
  trades: 'trade.upsert'
};
const SMALL_STORES = ['accounts', 'instruments', 'strategies', 'cashflows', 'reviews'];

// ---------------------------------------------------------------- local state

export async function loadFromCache() {
  const [accounts, instruments, strategies, cashflows, reviews, trades, settingsRows, meta] = await Promise.all([
    db.getAll('accounts'), db.getAll('instruments'), db.getAll('strategies'), db.getAll('cashflows'),
    db.getAll('reviews'), db.getAll('trades'), db.getAll('settings'), db.getAll('meta')
  ]);
  state.data = {
    accounts, instruments, strategies, cashflows, reviews, trades,
    settings: Object.fromEntries(settingsRows.map(r => [r.key, r.value]))
  };
  const last = meta.find(m => m.key === 'lastSync');
  state.sync.lastSync = last ? last.value : null;
  await refreshCounts();
  emit('data');
  emit('sync');
}

async function refreshCounts() {
  const ops = await db.getAll('outbox');
  state.sync.pending = ops.filter(o => !o.failed).length;
  state.sync.failed = ops.filter(o => o.failed).length;
}

function upsertLocal(store, rec) {
  const k = KEYS[store];
  const list = state.data[store];
  const i = list.findIndex(r => r[k] === rec[k]);
  if (i >= 0) list[i] = rec; else list.push(rec);
}

// ---------------------------------------------------------------- saving (optimistic)

/** Save one record locally right away and queue it for the server. Pass deleted:true to remove it. */
export async function saveRecord(store, row) {
  const k = KEYS[store];
  const rec = { ...row, updatedAt: new Date().toISOString() };
  if (rec.deleted === true) {
    await db.del(store, rec[k]);
    state.data[store] = state.data[store].filter(r => r[k] !== rec[k]);
  } else {
    await db.put(store, rec);
    upsertLocal(store, rec);
  }
  emit('data');
  await enqueue({ action: ACTIONS[store], payload: rec, store, key: rec[k] });
  return rec;
}

/** Save one or more settings (values are stored as text). */
export async function saveSettings(map) {
  const clean = {};
  for (const [key, value] of Object.entries(map)) {
    clean[key] = String(value);
    await db.put('settings', { key, value: clean[key] });
    state.data.settings[key] = clean[key];
  }
  emit('data');
  await enqueue({ action: 'settings.save', payload: clean, store: 'settings', key: 'settings' });
}



/**
 * Queue a screenshot upload. `field` says which trade column to fill once ImgBB returns a URL
 * (imgBefore or imgAfter). The trade doesn't need to be saved on the server yet: the image
 * uploads on its own, and the trade is patched and re-queued once the URL comes back.
 */
export async function queueImageUpload(tradeId, field, base64, name) {
  await db.put('outbox', {
    action: 'image.upload', store: null, key: null,
    payload: { base64, name }, tradeId, field,
    rev: 0, failed: false, createdAt: new Date().toISOString()
  });
  await refreshCounts();
  emit('sync');
  syncSoon();
}

async function enqueue(op) {
  const all = await db.getAll('outbox');
  const same = all.find(o => !o.failed && o.store === op.store && String(o.key) === String(op.key) && o.action === op.action);
  if (same) {
    const payload = op.action === 'settings.save' ? { ...same.payload, ...op.payload } : op.payload;
    await db.put('outbox', { ...same, payload, rev: (same.rev || 0) + 1 });
  } else {
    await db.put('outbox', { ...op, rev: 0, failed: false, createdAt: new Date().toISOString() });
  }
  await refreshCounts();
  emit('sync');
  syncSoon();
}

export async function discardOp(opId) {
  await db.del('outbox', opId);
  await refreshCounts();
  emit('sync');
}

export async function failedOps() {
  return (await db.getAll('outbox')).filter(o => o.failed);
}

// ---------------------------------------------------------------- sending and pulling

let running = null;

export function syncNow({ pull = true } = {}) {
  if (running) return running;
  running = run(pull).finally(() => { running = null; });
  return running;
}

let soon = null;
export function syncSoon(ms = 400) {
  clearTimeout(soon);
  soon = setTimeout(() => syncNow({ pull: false }), ms);
}

/** Forget the last sync time so the next pull re-reads everything from the Sheet. */
export async function fullRefresh() {
  await db.del('meta', 'lastSync');
  state.sync.lastSync = null;
  return syncNow();
}

async function run(pull) {
  if (!navigator.onLine) {
    state.sync.status = 'offline';
    emit('sync');
    return;
  }
  state.sync.status = 'syncing';
  state.sync.error = null;
  emit('sync');
  try {
    const sent = await sendOutbox();
    if (pull) await pullFromServer();
    else if (sent > 0) await loadFromCache();
    state.sync.status = 'idle';
  } catch (err) {
    if (err.code === 'AUTH') {
      state.sync.status = 'error';
      state.sync.error = err.message;
      emit('session');
    } else {
      state.sync.status = err.code === 'NETWORK' ? 'offline' : 'error';
      state.sync.error = err.message;
    }
  }
  await refreshCounts();
  emit('sync');
}

async function sendOutbox() {
  const ops = (await db.getAll('outbox')).filter(o => !o.failed).sort((a, b) => a.opId - b.opId);
  let sent = 0;
  for (const op of ops) {
    try {
      const { data } = await callApi(op.action, op.payload);
      const current = await db.get('outbox', op.opId);
      if (current && current.rev === op.rev) {           // not edited again while in flight
        await db.del('outbox', op.opId);
        if (op.action.endsWith('.upsert') && data && op.store) {
          if (data.deleted === true) await db.del(op.store, op.key);
          else await db.put(op.store, data);            // server-stamped version
        } else if (op.action === 'image.upload') {
          await applyUploadedImage(op.tradeId, op.field, data);
        }
      }
      sent++;
    } catch (err) {
      if (err.code === 'VALIDATION') {
        const current = await db.get('outbox', op.opId);
        if (current) await db.put('outbox', { ...current, failed: true, error: err.message });
        continue;
      }
      throw err;                                        // network, auth, busy: stop and retry later
    }
  }
  return sent;
}

async function applyUploadedImage(tradeId, field, imgbb) {
  const trade = await db.get('trades', tradeId);
  if (!trade) return; // the trade was deleted before its image finished uploading
  const deleteUrls = safeParseList(trade.imgDeleteUrls);
  deleteUrls.push(imgbb.deleteUrl);
  const patched = { ...trade, [field]: imgbb.url, imgDeleteUrls: JSON.stringify(deleteUrls), updatedAt: new Date().toISOString() };
  await db.put('trades', patched);
  upsertLocal('trades', patched);
  emit('data');
  await enqueue({ action: 'trade.upsert', payload: patched, store: 'trades', key: patched.id });
}
function safeParseList(v) { try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } }

async function pendingKeys() {
  const out = {};
  const add = (store, key) => { (out[store] ||= new Set()).add(String(key)); };
  for (const op of await db.getAll('outbox')) {
    if (op.failed || op.action === 'image.upload') continue;
    if (op.store === 'settings') Object.keys(op.payload || {}).forEach(k => add('settings', k));
    else add(op.store, op.key);
  }
  return out;
}

async function pullFromServer() {
  const since = state.sync.lastSync
    ? new Date(new Date(state.sync.lastSync).getTime() - SYNC_OVERLAP_MS).toISOString()
    : undefined;
  const { data, serverTime } = await callApi('bootstrap', since ? { since } : {});
  const pending = await pendingKeys();
  const none = new Set();

  for (const store of SMALL_STORES) {
    await db.replaceStore(store, data[store] || [], pending[store] || none);
  }

  const trades = data.trades || [];
  if (data.fullSync) {
    await db.replaceStore('trades', trades, pending.trades || none);
  } else {
    const skip = pending.trades || none;
    await db.putMany('trades', trades.filter(t => t.deleted !== true && !skip.has(String(t.id))));
    for (const t of trades.filter(t => t.deleted === true)) await db.del('trades', t.id);
  }

  const settingsRows = Object.entries(data.settings || {}).map(([key, value]) => ({ key, value }));
  await db.replaceStore('settings', settingsRows, pending.settings || none);

  await db.put('meta', { key: 'lastSync', value: serverTime });
  await loadFromCache();
}

// ---------------------------------------------------------------- background loop

let loopStarted = false;
export function startLoop() {
  if (loopStarted) return;
  loopStarted = true;
  window.addEventListener('online', () => syncNow());
  window.addEventListener('offline', () => { state.sync.status = 'offline'; emit('sync'); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, SYNC_INTERVAL_MS);
}
