import { useEffect, useMemo, useState } from 'react'
import BlurredValue from './BlurredValue.jsx'

const inr = n => '₹' + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 0 })
const signed = n => (n < 0 ? '-' : '+') + inr(n).slice(1)
const cls = n => (n > 0 ? 'pnl-up' : n < 0 ? 'pnl-down' : '')

// P&L per recommendation. SELL recos are treated as short calls: profit when
// price falls below the reco level. AVOID recos carry no position (P&L 0).
function compute(r) {
  const dir = r.action === 'SELL' ? -1 : 1
  const mark = r.status === 'CLOSED' ? r.exitPrice : r.ltp
  const invested = (r.entryPrice ?? 0) * r.qty
  const pnl = r.entryPrice != null && mark != null ? (mark - r.entryPrice) * r.qty * dir : 0
  const dayPnl = r.status === 'OPEN' && r.ltp != null && r.prevClose != null
    ? (r.ltp - r.prevClose) * r.qty * dir : 0
  return {
    invested,
    current: invested + pnl,
    pnl,
    netChgPct: invested ? (pnl / invested) * 100 : 0,
    dayPnl,
    dayChgPct: r.prevClose ? ((r.ltp - r.prevClose) / r.prevClose) * 100 * dir : 0,
  }
}

const FILTERS = ['All', 'Open', 'Closed', 'US', 'IPO', 'ETF']

export default function ReturnsTracker() {
  const [data, setData] = useState(null)
  const [filter, setFilter] = useState('All')

  useEffect(() => {
    fetch('/data/recommendations.json').then(r => r.json()).then(setData).catch(() => setData({ recommendations: [] }))
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    return data.recommendations
      .filter(r =>
        filter === 'All' ? true :
        filter === 'Open' ? r.status === 'OPEN' :
        filter === 'Closed' ? r.status === 'CLOSED' :
        r.module === filter)
      .map(r => ({ ...r, ...compute(r) }))
  }, [data, filter])

  if (!data) return null

  const totals = rows.reduce((t, r) => ({
    invested: t.invested + r.invested,
    current: t.current + r.current,
    pnl: t.pnl + r.pnl,
    dayPnl: t.dayPnl + r.dayPnl,
  }), { invested: 0, current: 0, pnl: 0, dayPnl: 0 })
  const totalPct = totals.invested ? (totals.pnl / totals.invested) * 100 : 0

  return (
    <div className="dashboard" id="returns">
      <h2>Returns on Recommendations</h2>
      <p className="section-sub">Every call the dashboard makes, marked-to-market — Kite-style. {data.source} · last refresh: {data.lastUpdated}</p>

      <div className="kite-summary">
        <div className="kite-stat">
          <span className="k-label">Total investment 👁</span>
          <span className="k-value"><BlurredValue label="total investment hidden">{inr(totals.invested)}</BlurredValue></span>
        </div>
        <div className="kite-stat">
          <span className="k-label">Current value 👁</span>
          <span className="k-value"><BlurredValue label="current value hidden">{inr(totals.current)}</BlurredValue></span>
        </div>
        <div className="kite-stat">
          <span className="k-label">Day's P&amp;L 👁</span>
          <span className={`k-value ${cls(totals.dayPnl)}`}><BlurredValue label="day P&L hidden">{signed(totals.dayPnl)}</BlurredValue></span>
        </div>
        <div className="kite-stat">
          <span className="k-label">Total P&amp;L 👁</span>
          <span className={`k-value ${cls(totals.pnl)}`}>
            <BlurredValue label="total P&L hidden">{signed(totals.pnl)}</BlurredValue>{' '}
            <small className={`k-chip ${cls(totals.pnl)}`}>{totalPct >= 0 ? '+' : ''}{totalPct.toFixed(2)}%</small>
          </span>
        </div>
      </div>

      <div className="kite-filters">
        {FILTERS.map(f => (
          <button key={f} className={`k-tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f} {f === 'All' ? `(${data.recommendations.length})` : ''}
          </button>
        ))}
      </div>

      <div className="table-wrap kite-table">
        <table>
          <thead>
            <tr>
              <th>Instrument</th><th>Reco</th><th className="num">Qty.</th><th className="num">Avg. cost</th>
              <th className="num">LTP / Exit</th><th className="num">Cur. val</th><th className="num">P&amp;L</th>
              <th className="num">Net chg.</th><th className="num">Day chg.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td>
                  <b>{r.symbol}</b> <span className="k-module">{r.module}</span>
                  <div className="k-reason">{r.reason}</div>
                </td>
                <td>
                  <span className={`k-action ${r.action.toLowerCase()}`}>{r.action}</span>
                  <div className="k-date">{r.recoDate}{r.status === 'CLOSED' ? ` → ${r.exitDate}` : ''}</div>
                </td>
                <td className="num">{r.qty || '—'}</td>
                <td className="num">{r.entryPrice != null ? r.entryPrice.toLocaleString('en-IN') : '—'}</td>
                <td className="num">{(r.status === 'CLOSED' ? r.exitPrice : r.ltp)?.toLocaleString('en-IN') ?? '—'}</td>
                <td className="num">{r.invested ? <BlurredValue label="current value hidden">{inr(r.current)}</BlurredValue> : '—'}</td>
                <td className={`num ${cls(r.pnl)}`}>{r.invested ? <BlurredValue label="P&L hidden">{signed(r.pnl)}</BlurredValue> : '—'}</td>
                <td className={`num ${cls(r.netChgPct)}`}>{r.invested ? `${r.netChgPct >= 0 ? '+' : ''}${r.netChgPct.toFixed(2)}%` : '—'}</td>
                <td className={`num ${cls(r.dayChgPct)}`}>{r.status === 'OPEN' && r.invested ? `${r.dayChgPct >= 0 ? '+' : ''}${r.dayChgPct.toFixed(2)}%` : '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan="9" style={{ color: 'var(--muted)' }}>No recommendations match this filter.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="target-line-note">
        Source: {data.source}. Closed calls use exit price; AVOID calls carry no position. ₹{data.capitalPerRecoInr?.toLocaleString('en-IN')} nominal capital per recommendation.
      </p>
    </div>
  )
}
