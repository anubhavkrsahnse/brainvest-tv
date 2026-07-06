import { useEffect, useState } from 'react'
import '../streamer.css'

export default function TickerTape() {
  const [dashboardData, setDashboardData] = useState(null)
  const [recoData, setRecoData] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/data/dashboard.json')
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .catch(() => null),
      fetch('/data/recommendations.json')
        .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .catch(() => null),
    ]).then(([dash, reco]) => {
      setDashboardData(dash)
      setRecoData(reco)
    })
  }, [])

  if (!dashboardData || !recoData) return null

  const items = []

  // Add signals
  if (dashboardData.signals) {
    dashboardData.signals.forEach(s => {
      const dir = s.changePct >= 0 ? '▲' : '▼'
      const pct = Math.abs(s.changePct).toFixed(2)
      items.push({
        key: `signal-${s.name}`,
        text: `${s.name} ${s.value.toLocaleString('en-IN')} ${dir}${pct}%`,
        type: s.changePct >= 0 ? 'buy' : 'sell',
        arrow: dir,
      })
    })
  }

  // Add open recommendations
  if (recoData.recommendations) {
    recoData.recommendations.forEach(reco => {
      if (reco.status === 'OPEN') {
        const direction = reco.action === 'SELL' ? -1 : 1
        const mark = reco.ltp || reco.entryPrice
        const netChgPct = reco.entryPrice && mark
          ? (mark - reco.entryPrice) / reco.entryPrice * 100 * direction
          : null

        if (netChgPct !== null) {
          const sign = netChgPct >= 0 ? '+' : ''
          const pct = Math.abs(netChgPct).toFixed(1)
          items.push({
            key: `reco-${reco.id}`,
            text: `${reco.symbol} ${reco.action} ${sign}${pct}%`,
            type: netChgPct >= 0 ? 'buy' : 'sell',
            arrow: netChgPct >= 0 ? '▲' : '▼',
          })
        }
      }
    })
  }

  // Duplicate for seamless loop
  const doubled = [...items, ...items]

  return (
    <div className="tt-container">
      <div className="tt-scroll">
        {doubled.map((item, idx) => (
          <div key={idx} className={`tt-item ${item.type}`}>
            <span className="tt-arrow">{item.arrow}</span>
            <span>{item.text}</span>
            {idx !== doubled.length - 1 && <span className="tt-separator">·</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
