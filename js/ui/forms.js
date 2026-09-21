// Add and edit dialogs for accounts and instruments.
import { openForm, confirmDialog } from './dialog.js';
import { saveRecord } from '../sync.js';
import { state } from '../store.js';
import { uuid, toast } from '../util.js';

export const ASSET_CLASSES = [
  { value: 'FOREX', label: 'Forex' },
  { value: 'COMMODITIES', label: 'Commodities' },
  { value: 'INDICES', label: 'Indices' },
  { value: 'CRYPTO', label: 'Crypto' }
];

export async function openAccountDialog(existing = null) {
  const editing = !!existing;
  const archived = editing && existing.active === false;
  const result = await openForm({
    title: editing ? 'Edit account' : 'Add account',
    fields: [
      { name: 'name', label: 'Account name', required: true, placeholder: 'Main live account' },
      { name: 'broker', label: 'Broker', placeholder: 'Broker name' },
      { name: 'type', label: 'Account type', type: 'select', options: [
        { value: 'LIVE', label: 'Live' }, { value: 'DEMO', label: 'Demo' }, { value: 'PROP', label: 'Prop firm' }] },
      { name: 'startBalance', label: 'Starting balance (USD)', type: 'number', required: true, min: 0 },
      { name: 'defaultLeverage', label: 'Default leverage', type: 'number', min: 1, step: '1',
        hint: 'Enter 100 for 1:100. New trades on this account start with this leverage.' }
    ],
    values: existing || { type: 'LIVE', defaultLeverage: 100 },
    submitLabel: editing ? 'Save changes' : 'Add account',
    secondary: editing ? (archived ? { label: 'Restore account' } : { label: 'Archive account', danger: true }) : null,
    validate: v => (!v.name ? 'Give the account a name.' : v.startBalance === null || v.startBalance < 0 ? 'Enter a starting balance of 0 or more.' : '')
  });
  if (!result) return null;

  const now = new Date().toISOString();
  if (result.action === 'secondary') {
    await saveRecord('accounts', { ...existing, active: archived });
    toast(archived ? 'Account restored' : 'Account archived. Its trades are kept.');
    return true;
  }
  const v = result.values;
  await saveRecord('accounts', {
    ...(existing || {}),
    id: existing ? existing.id : uuid(),
    name: v.name, broker: v.broker, type: v.type, currency: 'USD',
    startBalance: v.startBalance, defaultLeverage: v.defaultLeverage,
    active: existing ? existing.active !== false : true,
    createdAt: existing?.createdAt || now,
    deleted: false
  });
  toast(editing ? 'Account saved' : 'Account added');
  return true;
}

export async function openInstrumentDialog(existing = null) {
  const editing = !!existing;
  const result = await openForm({
    title: editing ? `Edit ${existing.symbol}` : 'Add instrument',
    fields: [
      { name: 'symbol', label: 'Symbol', required: true, readonly: editing, autocapitalize: 'characters',
        placeholder: 'EURUSD', hint: editing ? '' : 'Letters and numbers only, for example US30 or BTCUSDT.' },
      { name: 'assetClass', label: 'Market', type: 'select', options: ASSET_CLASSES },
      { name: 'baseCcy', label: 'Base currency', placeholder: 'EUR' },
      { name: 'quoteCcy', label: 'Quote currency', placeholder: 'USD',
        hint: 'The currency profit and loss is paid in. Anything other than USD needs a conversion rate on the trade.' },
      { name: 'contractSize', label: 'Contract size per 1.0 lot', type: 'number', min: 0,
        hint: 'Units in one lot, from your broker\'s contract specification. Leave empty until you know it.' },
      { name: 'tickSize', label: 'Smallest price step', type: 'number', min: 0 },
      { name: 'defaultLeverage', label: 'Default leverage for this instrument', type: 'number', min: 1, step: '1' },
      { name: 'verified', label: 'I checked these values with my broker', type: 'checkbox' },
      { name: 'notes', label: 'Notes', type: 'textarea', rows: 2 }
    ],
    values: existing || { assetClass: 'FOREX', quoteCcy: 'USD' },
    submitLabel: editing ? 'Save changes' : 'Add instrument',
    secondary: editing ? { label: 'Remove', danger: true } : null,
    validate: v => {
      const sym = v.symbol.toUpperCase();
      if (!/^[A-Z0-9._-]{2,20}$/.test(sym)) return 'Use 2 to 20 letters or numbers for the symbol.';
      if (!editing && state.data.instruments.some(i => i.symbol === sym)) return 'That symbol is already in your list.';
      return '';
    }
  });
  if (!result) return null;

  if (result.action === 'secondary') {
    const ok = await confirmDialog({
      title: `Remove ${existing.symbol}?`,
      text: 'Trades already logged on it keep their saved values. You can add the symbol again later.',
      confirmLabel: 'Remove instrument'
    });
    if (!ok) return null;
    await saveRecord('instruments', { ...existing, deleted: true });
    toast('Instrument removed');
    return true;
  }
  const v = result.values;
  await saveRecord('instruments', {
    ...(existing || {}),
    symbol: v.symbol.toUpperCase(), assetClass: v.assetClass, baseCcy: v.baseCcy, quoteCcy: v.quoteCcy,
    contractSize: v.contractSize, tickSize: v.tickSize, defaultLeverage: v.defaultLeverage,
    verified: v.verified, notes: v.notes, deleted: false
  });
  toast(editing ? 'Instrument saved' : 'Instrument added');
  return true;
}
