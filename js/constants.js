// Shared lists used by forms, calculations and screens.

export const ASSET_CLASSES = [
  { value: 'FOREX', label: 'Forex' },
  { value: 'COMMODITIES', label: 'Commodities' },
  { value: 'INDICES', label: 'Indices' },
  { value: 'CRYPTO', label: 'Crypto' }
];
export const assetLabel = v => (ASSET_CLASSES.find(a => a.value === v) || { label: v || '' }).label;

// Smallest lot increment used when rounding a suggested position size down. Brokers differ, so treat as a guide.
export const LOT_STEP = { FOREX: 0.01, COMMODITIES: 0.01, INDICES: 0.1, CRYPTO: 0.001 };

export const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];

export const SESSIONS = [
  { value: 'ASIA', label: 'Asia' },
  { value: 'LONDON', label: 'London' },
  { value: 'OVERLAP', label: 'London and New York overlap' },
  { value: 'NEWYORK', label: 'New York' }
];
export const sessionLabel = v => (SESSIONS.find(s => s.value === v) || { label: v || '' }).label;

/** Trading session for a moment in time, from UTC hours (ignores daylight saving; you can override it on the trade). */
export function sessionOf(iso) {
  const h = new Date(iso).getUTCHours();
  if (h >= 22 || h < 7) return 'ASIA';
  if (h < 12) return 'LONDON';
  if (h < 16) return 'OVERLAP';
  return 'NEWYORK';
}

export const EMOTIONS = ['Calm', 'Confident', 'Focused', 'Hesitant', 'Anxious', 'FOMO', 'Revenge', 'Greedy', 'Bored', 'Tired'];

// Quote currencies treated as US dollars for a USD account.
export const USD_LIKE = new Set(['USD', 'USDT', 'USDC', 'BUSD', 'FDUSD']);
