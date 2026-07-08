import { useEffect, useState } from 'react'
import { fetchData } from '../dataSource.js'

export default function USStocksModule() {
  const [data, setData] = useState(null)
  const [maxPe, setMaxPe] = useState(100)
  const [maxRsi, setMaxRsi] = useState(100)
  const [action, setAction] = useState('all')

  useEffect(() => {
    fetchData('us_stocks.json').then(setData).catch(() => setData({ stocks: [] }))
  }, [])

  if (!data) return null
  const rows = data.stocks.filter(s =>
    (s.peRatio ?? 0) <= maxPe && s.rsi14 <= maxRsi && (action === 'all' || s.action === action)
  )

  return (
    <div className="dashboard" id="us-stocks">
      <h2>US Stocks — Buy / Sell / Bid Levels</h2>
      <p className="section-sub">Parameters: P/E, market cap, 52-week proximity, RSI-14, volume · Source: Yahoo Finance · last refresh: {data.lastUpdated}</p>

      <div className="filter-row">
        <label>Max P/E <input type="range" min="5" max="100" value={maxPe} onChange={e => setMaxPe(+e.target.value)} /> <b>{maxPe}</b></label>
        <label>Max RSI <input type="range" min="10" max="100" value={maxRsi} onChange={e => setMaxRsi(+e.target.value)} /> <b>{maxRsi}</b></label>
        <label>Action
          <select value={action} onChange={e => setAction(e.target.value)}>
            <option value="all">All</option><option value="BUY">Buy</option><option value="SELL">Sell</option><option value="HOLD">Hold</option>
          </select>
        </label>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Symbol</th><th>Price</th><th>P/E</th><th>Mkt Cap</th><th>52w %</th><th>RSI-14</th><th>Buy</th><th>Bid</th><th>Sell</th><th>Signal</th></tr>
          </thead>
          <tbody>
            {rows.map(s => (
              <tr key={s.symbol}>
                <td><b>{s.symbol}</b></td>
                <td>${s.price}</td>
                <td>{s.peRatio?.toFixed(1) ?? '—'}</td>
                <td>{s.marketCap ? '$' + (s.marketCap / 1e12).toFixed(2) + 'T' : '—'}</td>
                <td>{s.high52wProximityPct}%</td>
                <td>{s.rsi14}</td>
                <td>${s.buyLevel}</td>
                <td>${s.bidLevel}</td>
                <td>${s.sellLevel}</td>
                <td><span className={`badge ${s.action.toLowerCase()}`}>{s.action}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="target-line-note">Source: Yahoo Finance. Levels are algorithmic (20DMA/RSI/52w rules), not advice.</p>
    </div>
  )
}
