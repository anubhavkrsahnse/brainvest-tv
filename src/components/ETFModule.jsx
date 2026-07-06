import { useEffect, useState } from 'react'

export default function ETFModule() {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetch('/data/etf.json').then(r => r.json()).then(setData).catch(() => setData({ rows: [] }))
  }, [])

  if (!data) return null

  return (
    <div className="dashboard" id="etf">
      <h2>ETF — Actual vs Target Allocation</h2>
      <p className="section-sub">
        Targets: Google Sheet "Kaushik sir etf" · Holdings: Zerodha Kite contract notes via Gmail · last refresh: {data.lastUpdated ?? '—'}
      </p>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>ETF</th><th>Held qty</th><th>Actual %</th><th>Target %</th><th>Delta</th><th>AUM (Cr)</th><th>Expense</th><th>1Y TE</th></tr>
          </thead>
          <tbody>
            {data.rows.map(r => (
              <tr key={r.symbol}>
                <td><b>{r.symbol}</b></td>
                <td>{r.heldQty}</td>
                <td>{r.actualPct}%</td>
                <td>{r.targetPct}%</td>
                <td className={r.deltaPct >= 0 ? 'up' : 'down'}>{r.deltaPct > 0 ? '+' : ''}{r.deltaPct}%</td>
                <td>{r.aumCr?.toLocaleString('en-IN') ?? '—'}</td>
                <td>{r.expenseRatio != null ? r.expenseRatio + '%' : '—'}</td>
                <td>{r.trackingError1y != null ? r.trackingError1y + '%' : '—'}</td>
              </tr>
            ))}
            {data.rows.length === 0 && <tr><td colSpan="8" style={{ color: 'var(--muted)' }}>No ETF data yet — runs after Gmail + Sheet secrets are configured.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="target-line-note">Sources: Google Sheet "Kaushik sir etf" (targets), Zerodha contract notes via Gmail API (holdings).</p>
    </div>
  )
}
