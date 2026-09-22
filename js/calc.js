// Pure calculation helpers: balances, trade math (margin, risk, P&L), and a lot-size suggestion.
// Kept side-effect free so it can be unit tested without a browser.
import { USD_LIKE } from './constants.js';

export function accountBalance(account, data) {
  const cashflow = data.cashflows
    .filter(c => c.accountId === account.id)
    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const pnl = data.trades
    .filter(t => t.accountId === account.id && t.status === 'CLOSED' && t.deleted !== true)
    .reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
  return (Number(account.startBalance) || 0) + cashflow + pnl;
}

export function summarize(data, accounts) {
  const ids = new Set(accounts.map(a => a.id));
  const trades = data.trades.filter(t => ids.has(t.accountId) && t.deleted !== true);
  const closed = trades.filter(t => t.status === 'CLOSED');
  return {
    closed: closed.length,
    open: trades.filter(t => t.status === 'OPEN').length,
    netPnl: closed.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0)
  };
}

/**
 * How to convert one unit of the instrument's quote currency into the account's USD.
 * Returns a number, or null when it cannot be worked out automatically (a cross pair).
 */
export function resolveRate(instrument, price) {
  if (!instrument) return null;
  const quote = (instrument.quoteCcy || '').toUpperCase();
  if (quote === '' || USD_LIKE.has(quote)) return 1;
  const base = (instrument.baseCcy || '').toUpperCase();
  if (base === 'USD') return price ? 1 / price : null;
  return null;
}

export function hasContractSize(instrument) {
  return !!instrument && instrument.contractSize !== null && instrument.contractSize !== undefined && instrument.contractSize !== '' && Number(instrument.contractSize) > 0;
}

/**
 * Computes every derived number for a trade. `input` holds the raw form values (numbers or null).
 * `data` is the full app data set, used to look up the account's current balance for risk %.
 * Nothing here is saved; the caller merges the result into the trade record.
 */
export function calcTrade(input, instrument, account, data) {
  const out = {};
  const sized = hasContractSize(instrument);
  const contractSize = sized ? Number(instrument.contractSize) : null;
  const lots = Number(input.lots) || 0;
  out.units = sized ? lots * contractSize : null;

  const entry = numOrNull(input.entry);
  const leverage = numOrNull(input.leverage);
  const autoRate = entry !== null ? resolveRate(instrument, entry) : null;
  const manualRate = numOrNull(input.fxRateToAcct);
  const rate = manualRate !== null ? manualRate : autoRate;
  out.rateNeeded = sized && entry !== null && autoRate === null;
  out.rateUsed = rate;

  out.notional = sized && entry !== null && rate ? out.units * entry * rate : null;
  out.margin = out.notional !== null && leverage ? out.notional / leverage : null;

  const stop = numOrNull(input.stopLoss);
  out.riskAmount = sized && stop !== null && entry !== null && rate ? Math.abs(entry - stop) * out.units * rate : null;

  const take = numOrNull(input.takeProfit);
  if (stop !== null && take !== null && entry !== null && Math.abs(entry - stop) > 0) {
    out.plannedRR = Math.abs(take - entry) / Math.abs(entry - stop);
  } else out.plannedRR = null;

  out.riskPct = out.riskAmount !== null && account && data ? safeDiv(out.riskAmount, accountBalance(account, data)) * 100 : null;

  if (input.status === 'CLOSED') {
    const exit = numOrNull(input.exit);
    const sign = input.direction === 'SHORT' ? -1 : 1;
    const exitAutoRate = exit !== null ? resolveRate(instrument, exit) : autoRate;
    const exitRate = manualRate !== null ? manualRate : exitAutoRate;

    if (input.pnlMode === 'MANUAL') {
      out.pnl = numOrNull(input.pnl);
      out.grossPnl = out.pnl;
    } else if (sized && entry !== null && exit !== null && exitRate) {
      out.grossPnl = (exit - entry) * sign * out.units * exitRate;
      out.pnl = out.grossPnl - (Number(input.fees) || 0) + (Number(input.swap) || 0);
    } else {
      out.grossPnl = null;
      out.pnl = null;
    }
    out.rMultiple = out.pnl !== null && out.riskAmount ? out.pnl / out.riskAmount : null;
  } else {
    out.grossPnl = null;
    out.pnl = null;
    out.rMultiple = null;
  }

  return out;
}

/** Lot size that risks approximately riskPctTarget of the account balance on this stop distance. */
export function suggestLots(balance, riskPctTarget, entry, stop, instrument) {
  if (!balance || !riskPctTarget || !entry || !stop || !hasContractSize(instrument)) return null;
  const distance = Math.abs(entry - stop);
  if (!distance) return null;
  const rate = resolveRate(instrument, entry);
  if (!rate) return null;
  const riskAmount = balance * (riskPctTarget / 100);
  const lots = riskAmount / (distance * Number(instrument.contractSize) * rate);
  return lots > 0 ? lots : null;
}

function numOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function safeDiv(a, b) { return b ? a / b : null; }
