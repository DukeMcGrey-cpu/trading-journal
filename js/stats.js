// Pure statistics helpers for the Analytics screen. Kept side-effect free so they're easy to
// unit test by hand-working a small set of example trades and checking the output.

function sum(nums) { return nums.reduce((s, v) => s + (Number(v) || 0), 0); }

/**
 * Summarizes a set of CLOSED trades (the caller filters out open and deleted ones first).
 * Every figure here is computed from `pnl`, so it already reflects fees and swap.
 */
export function computeStats(trades) {
  const closed = trades;
  const wins = closed.filter(t => Number(t.pnl) > 0);
  const losses = closed.filter(t => Number(t.pnl) < 0);
  const grossWin = sum(wins.map(t => t.pnl));
  const grossLoss = Math.abs(sum(losses.map(t => t.pnl)));
  const netPnl = sum(closed.map(t => t.pnl));
  const winRate = closed.length ? wins.length / closed.length : 0;
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? -grossLoss / losses.length : 0; // kept negative, like the trades it's averaging
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : 0);
  const payoffRatio = avgLoss < 0 ? avgWin / Math.abs(avgLoss) : (avgWin > 0 ? Infinity : 0);
  const expectancy = winRate * avgWin + (1 - winRate) * avgLoss;

  const rTrades = closed.filter(t => t.rMultiple !== null && t.rMultiple !== undefined && Number.isFinite(Number(t.rMultiple)));
  const avgR = rTrades.length ? sum(rTrades.map(t => t.rMultiple)) / rTrades.length : null;

  const pnls = closed.map(t => Number(t.pnl) || 0);
  const best = pnls.length ? Math.max(...pnls) : null;
  const worst = pnls.length ? Math.min(...pnls) : null;

  // Equity curve (cumulative P&L in trade order) and the worst peak-to-trough drop along it.
  let running = 0, peak = 0, maxDrawdown = 0;
  const equityCurve = [];
  for (const t of closed) {
    running += Number(t.pnl) || 0;
    peak = Math.max(peak, running);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - running) / peak);
    equityCurve.push({ closeTime: t.closeTime, cumPnl: running });
  }
  const currentDrawdown = peak > 0 ? (peak - running) / peak : 0;

  // Longest win/loss streaks, in trade order. A breakeven trade (pnl === 0) resets both.
  let curWin = 0, curLoss = 0, maxWinStreak = 0, maxLossStreak = 0;
  for (const t of closed) {
    const p = Number(t.pnl) || 0;
    if (p > 0) { curWin++; curLoss = 0; }
    else if (p < 0) { curLoss++; curWin = 0; }
    else { curWin = 0; curLoss = 0; }
    maxWinStreak = Math.max(maxWinStreak, curWin);
    maxLossStreak = Math.max(maxLossStreak, curLoss);
  }

  return {
    count: closed.length, netPnl, winRate, avgWin, avgLoss, profitFactor, payoffRatio, expectancy, avgR,
    best, worst, equityCurve, maxDrawdown, currentDrawdown, maxWinStreak, maxLossStreak
  };
}

/**
 * Buckets trades by keyFn(trade) and computes stats for each bucket, sorted by net P&L
 * descending (best group first). keyFn returning null/undefined skips that trade entirely.
 * labelFn(key) -> display label; defaults to the key itself.
 */
export function groupBy(trades, keyFn, labelFn = k => k) {
  const groups = new Map();
  for (const t of trades) {
    const key = keyFn(t);
    if (key === null || key === undefined) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }
  return [...groups.entries()]
    .map(([key, list]) => ({ key, label: labelFn(key), stats: computeStats(list) }))
    .sort((a, b) => b.stats.netPnl - a.stats.netPnl);
}
