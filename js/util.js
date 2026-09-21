// Small shared helpers: ids, safe HTML templating, formatting, toasts.

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---- HTML templating that escapes every interpolated value by default ----
const RAW = Symbol('raw');
export const isRaw = v => v !== null && typeof v === 'object' && RAW in v;

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function raw(s) { return { [RAW]: String(s) }; }

function renderValue(v) {
  if (Array.isArray(v)) return v.map(renderValue).join('');
  if (isRaw(v)) return v[RAW];
  if (v === false || v === null || v === undefined) return '';
  return esc(v);
}
export function html(strings, ...values) {
  let out = '';
  strings.forEach((s, i) => { out += s; if (i < values.length) out += renderValue(values[i]); });
  return raw(out);
}
export function mount(el, tpl) { el.innerHTML = isRaw(tpl) ? tpl[RAW] : esc(tpl); }

// ---- Formatting ----
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export function money(n) {
  if (n === null || n === undefined || n === '' || Number.isNaN(Number(n))) return '—';
  return usd.format(Number(n));
}
export function signedMoney(n) {
  const v = Number(n) || 0;
  return (v > 0 ? '+' : '') + usd.format(v);
}
export function plain(n, maxFrac = 6) {
  if (n === null || n === undefined || n === '') return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: maxFrac }).format(Number(n));
}
export function toNumber(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function timeAgo(iso) {
  if (!iso) return '';
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}
export function deviceTimeZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return 'UTC'; }
}

// ---- DOM ----
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function toast(message, kind = 'info', ms = 3800) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  host.appendChild(el);
  setTimeout(() => { el.classList.add('leaving'); setTimeout(() => el.remove(), 260); }, ms);
}
