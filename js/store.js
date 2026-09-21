// In-memory app state plus a tiny publish/subscribe so screens redraw when data or sync status changes.

const topics = { data: new Set(), sync: new Set(), session: new Set() };

export function on(topic, fn) {
  topics[topic].add(fn);
  return () => topics[topic].delete(fn);
}
export function emit(topic) {
  topics[topic].forEach(fn => { try { fn(); } catch (e) { console.error(e); } });
}

export const state = {
  activeAccountId: localStorage.getItem('tj_account') || 'all',
  data: { accounts: [], instruments: [], strategies: [], cashflows: [], reviews: [], trades: [], settings: {} },
  sync: { status: 'idle', pending: 0, failed: 0, lastSync: null, error: null }
};

export function activeAccounts() {
  return state.data.accounts
    .filter(a => a.active !== false)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
}
export function archivedAccounts() {
  return state.data.accounts.filter(a => a.active === false);
}
/** Accounts the current account switcher points at ("all" or one account). */
export function visibleAccounts() {
  const list = activeAccounts();
  if (state.activeAccountId === 'all') return list;
  const one = list.find(a => a.id === state.activeAccountId);
  return one ? [one] : list;
}
export function setActiveAccount(id) {
  state.activeAccountId = id;
  localStorage.setItem('tj_account', id);
  emit('data');
}
