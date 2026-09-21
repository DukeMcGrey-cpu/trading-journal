// Pure calculation helpers. More (margin, risk, R multiple, statistics) arrive with the trade form.

export function accountBalance(account, data) {
  const cashflow = data.cashflows
    .filter(c => c.accountId === account.id)
    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  const pnl = data.trades
    .filter(t => t.accountId === account.id && t.status === 'CLOSED')
    .reduce((sum, t) => sum + (Number(t.pnl) || 0), 0);
  return (Number(account.startBalance) || 0) + cashflow + pnl;
}

export function summarize(data, accounts) {
  const ids = new Set(accounts.map(a => a.id));
  const trades = data.trades.filter(t => ids.has(t.accountId));
  const closed = trades.filter(t => t.status === 'CLOSED');
  return {
    closed: closed.length,
    open: trades.filter(t => t.status === 'OPEN').length,
    netPnl: closed.reduce((sum, t) => sum + (Number(t.pnl) || 0), 0)
  };
}
