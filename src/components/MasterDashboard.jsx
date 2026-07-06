import { useEffect, useState } from 'react'

const MONTHLY_TARGET = 1.32 // % — geometric monthly slice of the 17% annual goal

export default function MasterDashboard() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/data/dashboard.json')
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch(e => setError(e.message))
  }, [])

  if (error) return <div className="dashboard"><h2>Master Dashboard</h2><p className="section-sub">Failed to load data: {error}</p></div>
  if (!data) return <div className="dashboard"><h2>Master Dashboard</h2><p className="section-sub">Loading…</p></div>

  return (
    <div className="dashboard">
      <h2>Market Signals</h2>
      <p className="section-sub">Opening / closing context from global indices · last refresh: {data.lastUpdated}</p>

      <div className="signal-grid">
        {data.signals.map(s => (
          <div className="card" key={s.name}>
            <div className="label">{s.name}</div>
            <div className="value">{s.value.toLocaleString('en-IN')}</div>
            <div className={`delta ${s.changePct >= 0 ? 'up' : 'down'}`}>
              {s.changePct >= 0 ? '▲' : '▼'} {Math.abs(s.changePct).toFixed(2)}%
            </div>
            <div className={`badge ${s.signal.toLowerCase()}`}>{s.signal}</div>
            <div className="source">Source: {s.source}</div>
          </div>
        ))}
      </div>

      <h2>17% Target Tracker — {data.trackerYear}</h2>
      <p className="section-sub">
        Every algorithmic recommendation is scored against the ~{MONTHLY_TARGET}%/month milestone.
        Green = milestone met, red = missed, dashed = pending.
      </p>

      <div className="tracker-bars">
        {data.tracker.map(m => {
          const status = m.actualPct == null ? 'pending' : m.actualPct >= MONTHLY_TARGET ? 'met' : 'missed'
          const height = m.actualPct == null ? 8 : Math.min(Math.abs(m.actualPct) / 3 * 100, 100)
          return (
            <div className="tracker-col" key={m.month} title={`${m.month}: ${m.actualPct == null ? 'pending' : m.actualPct + '%'} vs target ${MONTHLY_TARGET}%`}>
              <div className={`bar ${status}`} style={{ height: `${height}%` }} />
              <span className="m-label">{m.month}</span>
            </div>
          )
        })}
      </div>
      <p className="target-line-note">
        Source: {data.trackerSource}. Monthly milestone = (1.17)^(1/12) − 1 ≈ {MONTHLY_TARGET}%.
      </p>
    </div>
  )
}
