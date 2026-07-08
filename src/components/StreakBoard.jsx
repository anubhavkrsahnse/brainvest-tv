import { useEffect, useState, useMemo } from 'react'
import { fetchData } from '../dataSource.js'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function StreakBoard() {
  const [dashboardData, setDashboardData] = useState(null)
  const [recoData, setRecoData] = useState(null)

  useEffect(() => {
    Promise.all([
      fetchData('dashboard.json')
        .catch(() => null),
      fetchData('recommendations.json')
        .catch(() => null),
    ]).then(([dash, reco]) => {
      setDashboardData(dash)
      setRecoData(reco)
    })
  }, [])

  const stats = useMemo(() => {
    if (!dashboardData || !recoData) return null

    // (a) Milestone streak: consecutive non-null months from the end where actualPct >= target
    const tracker = dashboardData.tracker || []
    const target = dashboardData.monthlyTargetPct || 1.32
    let streak = 0
    for (let i = tracker.length - 1; i >= 0; i--) {
      if (tracker[i].actualPct == null) break
      if (tracker[i].actualPct >= target) {
        streak++
      } else {
        break
      }
    }

    // (b) Win rate: % of CLOSED with netChgPct > 0 (AVOID with null netChgPct counts as win)
    const recommendations = recoData.recommendations || []
    let closedCount = 0
    let winsCount = 0
    recommendations.forEach(reco => {
      if (reco.status === 'CLOSED') {
        closedCount++
        if (reco.action === 'AVOID') {
          // AVOID with no position is a win (avoided loss)
          if (reco.entryPrice == null) {
            winsCount++
          }
        } else {
          const direction = reco.action === 'SELL' ? -1 : 1
          const mark = reco.exitPrice || reco.ltp
          if (reco.entryPrice && mark) {
            const netChgPct = (mark - reco.entryPrice) / reco.entryPrice * 100 * direction
            if (netChgPct > 0) {
              winsCount++
            }
          }
        }
      }
    })
    const winRate = closedCount > 0 ? (winsCount / closedCount * 100).toFixed(0) : 0

    // (c) Open calls: count of OPEN
    const openCount = recommendations.filter(r => r.status === 'OPEN').length

    // (d) Best month: max non-null actualPct with month name
    let bestMonth = null
    let bestPct = -Infinity
    tracker.forEach(m => {
      if (m.actualPct != null && m.actualPct > bestPct) {
        bestPct = m.actualPct
        bestMonth = m.month
      }
    })

    return {
      streak,
      winRate: parseInt(winRate),
      openCount,
      bestMonth: bestMonth ? `${bestMonth} (${bestPct.toFixed(1)}%)` : 'N/A',
    }
  }, [dashboardData, recoData])

  if (!stats) return null

  return (
    <div className="sb-container">
      <div className="sb-tile">
        <div className="sb-label">Milestone Streak</div>
        <div className={`sb-value ${stats.streak >= 1 ? 'positive' : 'negative'}`}>
          {stats.streak >= 3 && <span className="sb-emoji">🔥</span>}
          {stats.streak}
        </div>
      </div>

      <div className="sb-tile">
        <div className="sb-label">Win Rate</div>
        <div className={`sb-value ${stats.winRate >= 50 ? 'positive' : 'negative'}`}>
          {stats.winRate}%
        </div>
      </div>

      <div className="sb-tile">
        <div className="sb-label">Open Calls</div>
        <div className="sb-value">{stats.openCount}</div>
      </div>

      <div className="sb-tile">
        <div className="sb-label">Best Month</div>
        <div className="sb-value positive">{stats.bestMonth}</div>
      </div>
    </div>
  )
}
