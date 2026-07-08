import { useEffect, useState, useMemo } from 'react'
import { fetchData } from '../dataSource.js'

export default function CallOfTheDay() {
  const [data, setData] = useState(null)

  useEffect(() => {
    fetchData('recommendations.json')
      .then(setData)
      .catch(() => setData(null))
  }, [])

  const callOfTheDay = useMemo(() => {
    if (!data || !data.recommendations) return null

    let best = null
    let bestAbsNetChg = -1

    data.recommendations.forEach(reco => {
      if (reco.status === 'OPEN') {
        const direction = reco.action === 'SELL' ? -1 : 1
        const mark = reco.ltp || reco.entryPrice
        const netChgPct = reco.entryPrice && mark
          ? (mark - reco.entryPrice) / reco.entryPrice * 100 * direction
          : null

        if (netChgPct !== null) {
          const absNetChg = Math.abs(netChgPct)
          if (absNetChg > bestAbsNetChg) {
            bestAbsNetChg = absNetChg
            best = { ...reco, netChgPct }
          }
        }
      }
    })

    return best
  }, [data])

  if (!data || !callOfTheDay) return null

  return (
    <div className="cotd-card">
      <div className="cotd-kicker">★ CALL OF THE DAY</div>

      <div className="cotd-symbol-row">
        <div className="cotd-symbol">{callOfTheDay.symbol}</div>
        <div className="cotd-module-tag">{callOfTheDay.module}</div>
      </div>

      <div className="cotd-action-pill" style={{ marginBottom: '12px' }}>
        {callOfTheDay.action === 'BUY' ? 'BUY' : 'SELL'}
      </div>

      <div className={`cotd-action-pill ${callOfTheDay.action === 'BUY' ? 'buy' : 'sell'}`}>
        {callOfTheDay.action === 'BUY' ? 'BUY' : 'SELL'}
      </div>

      <div className={`cotd-pnl ${callOfTheDay.netChgPct >= 0 ? 'positive' : 'negative'}`}>
        {callOfTheDay.netChgPct >= 0 ? '+' : ''}{callOfTheDay.netChgPct.toFixed(1)}%
      </div>

      <div className="cotd-reason">{callOfTheDay.reason}</div>

      <div className="cotd-footer">Source: {data.source}</div>
    </div>
  )
}
