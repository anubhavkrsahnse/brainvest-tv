import { useEffect, useState } from 'react'
import { fetchData } from '../dataSource.js'

export default function IPOModule() {
  const [data, setData] = useState(null)
  const [minGmp, setMinGmp] = useState(-50)
  const [minQib, setMinQib] = useState(0)
  const [maxSize, setMaxSize] = useState(10000)
  const [status, setStatus] = useState('all')

  useEffect(() => {
    fetchData('ipo.json').then(setData).catch(() => setData({ ipos: [] }))
  }, [])

  if (!data) return null
  const rows = data.ipos.filter(i =>
    (i.gmpPct ?? 0) >= minGmp &&
    (i.qibSubscription ?? 0) >= minQib &&
    (i.issueSizeCr ?? 0) <= maxSize &&
    (status === 'all' || i.status === status)
  )

  return (
    <div className="dashboard" id="ipo">
      <h2>IPO Discovery</h2>
      <p className="section-sub">
        Issue list: NSE · GMP: IPO Watch (unofficial grey market, indicative only) · last refresh: {data.lastUpdated}
      </p>

      <div className="filter-row">
        <label>Min GMP % <input type="range" min="-50" max="100" value={minGmp} onChange={e => setMinGmp(+e.target.value)} /> <b>{minGmp}%</b></label>
        <label>Min QIB subs <input type="range" min="0" max="50" value={minQib} onChange={e => setMinQib(+e.target.value)} /> <b>{minQib}x</b></label>
        <label>Max issue size <input type="range" min="100" max="10000" step="100" value={maxSize} onChange={e => setMaxSize(+e.target.value)} /> <b>₹{maxSize.toLocaleString('en-IN')} Cr</b></label>
        <label>Status
          <select value={status} onChange={e => setStatus(e.target.value)}>
            <option value="all">All</option>
            <option value="current">Open now</option>
            <option value="upcoming">Upcoming</option>
          </select>
        </label>
      </div>

      <div className="signal-grid">
        {rows.map(i => (
          <div className="card" key={i.company}>
            <div className="label">
              {i.status === 'current' ? '🟢 Open' : '🕒 Upcoming'} · {i.openDate} → {i.closeDate}
              {i.board ? ` · ${i.board}` : ''}
            </div>
            <div className="value" style={{ fontSize: 20 }}>
              {i.company}
              {i.verdict && (
                <span className={`verdict-chip ${/avoid|risky|skip/i.test(i.verdict) ? 'v-avoid' : /apply/i.test(i.verdict) ? 'v-apply' : 'v-neutral'}`}>
                  {i.verdict}
                </span>
              )}
            </div>
            <div className="ipo-stats">
              <span>Band {i.priceBand ?? '—'}</span>
              <span>Size ₹{i.issueSizeCr?.toLocaleString('en-IN') ?? '—'} Cr</span>
              <span>QIB {i.qibSubscription != null ? i.qibSubscription + 'x' : '—'}</span>
              <span className={i.gmpPct >= 0 ? 'up' : 'down'}>
                GMP {i.gmpPct != null ? `₹${i.gmpRs ?? '—'} (+${i.gmpPct}%)`.replace('(+-', '(−') : '—'}
              </span>
            </div>
            {i.moat && <p className="ipo-moat">{i.moat}</p>}
            <ul className="pros">{i.pros.map(p => <li key={p}>✓ {p}</li>)}</ul>
            <ul className="cons">{i.cons.map(c => <li key={c}>✗ {c}</li>)}</ul>
            <div className="source">
              Source: {i.source}{i.gmpSource ? ` · GMP: ${i.gmpSource}` : ''}{i.moat ? ' · Analysis: IPO Watch' : ''}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="section-sub">No IPOs match the current filters.</p>}
      </div>
    </div>
  )
}
