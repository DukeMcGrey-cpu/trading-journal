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

// ---- Time zones: everything is stored as UTC, shown in the timezone chosen in Settings ----
export const effectiveTz = setting => (!setting || setting === 'auto' ? deviceTimeZone() : setting);
const pad2 = n => String(n).padStart(2, '0');

function zonedParts(ts, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  const o = {};
  for (const p of f.formatToParts(new Date(ts))) if (p.type !== 'literal') o[p.type] = Number(p.value);
  return o;
}
function tzOffsetMs(ts, tz) {
  const p = zonedParts(ts, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ts / 1000) * 1000;
}
/** UTC ISO string -> "YYYY-MM-DDTHH:mm" wall-clock time in tz (for datetime-local inputs). */
export function isoToLocalInput(iso, tz) {
  if (!iso) return '';
  const p = zonedParts(new Date(iso).getTime(), tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;
}
/** "YYYY-MM-DDTHH:mm" wall-clock time in tz -> UTC ISO string. */
export function localInputToIso(str, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(str || '');
  if (!m) return null;
  const guess = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let ts = guess - tzOffsetMs(guess, tz);
  ts = guess - tzOffsetMs(ts, tz);
  return new Date(ts).toISOString();
}
export const nowLocalInput = tz => isoToLocalInput(new Date().toISOString(), tz);
/** The calendar day ("YYYY-MM-DD") an instant falls on in tz. */
export function dateKey(iso, tz) {
  const p = zonedParts(new Date(iso).getTime(), tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}
export function addDaysKey(key, n) {
  const d = new Date(key + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function weekStartKey(key) {          // weeks start on Monday
  const dow = (new Date(key + 'T00:00:00Z').getUTCDay() + 6) % 7;
  return addDaysKey(key, -dow);
}
export function inPeriod(iso, period, tz) {
  if (period === 'all' || !iso) return true;
  const key = dateKey(iso, tz);
  const today = dateKey(new Date().toISOString(), tz);
  if (period === 'today') return key === today;
  if (period === 'week') return key >= weekStartKey(today) && key <= today;
  if (period === 'month') return key.slice(0, 7) === today.slice(0, 7);
  if (period === 'year') return key.slice(0, 4) === today.slice(0, 4);
  return true;
}
export function formatDateTime(iso, tz) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
}
export function formatDate(dateStr) {       // "YYYY-MM-DD" -> "Sep 19, 2026"
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(dateStr + 'T00:00:00Z'));
}
export function duration(fromIso, toIso) {
  if (!fromIso || !toIso) return '';
  const mins = Math.max(0, Math.round((new Date(toIso) - new Date(fromIso)) / 60000));
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
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

// ---- Rounding and date display helpers ----
export function round(n, dp = 2) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  return Number(n.toFixed(dp));
}
/** "YYYY-MM-DD" -> "Mon, Sep 21, 2026" */
export function formatDay(key) {
  return new Date(key + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}
export function formatTime(iso, tz) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}
