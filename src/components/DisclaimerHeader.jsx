import { useEffect, useState } from 'react'
import { fetchData } from '../dataSource.js'

export default function DisclaimerHeader() {
  const [lastUpdated, setLastUpdated] = useState(null)

  useEffect(() => {
    fetchData('dashboard.json').then(d => setLastUpdated(d.lastUpdated)).catch(() => {})
  }, [])

  return (
    <>
      <div className="disclaimer-bar" role="alert">
        ⚠️ FOR EDUCATIONAL PURPOSES ONLY · NOT SEBI REGISTERED · NOT FINANCIAL ADVICE ⚠️
      </div>
      <nav className="nav">
        <div className="brand">br<span>AI</span>nvest</div>
        <div className="nav-right">
          <div className="tagline">Stocks with brAIn · auto-refreshed 9:00 AM / 4:00 PM IST via GitHub Actions</div>
          <div className="last-updated">
            🟢 Last updated: <b>{lastUpdated || '—'}</b>
          </div>
        </div>
      </nav>
    </>
  )
}
