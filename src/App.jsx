import DisclaimerHeader from './components/DisclaimerHeader.jsx'
import Deck from './components/Deck.jsx'
import TargetLoop from './components/TargetLoop.jsx'
import MasterDashboard from './components/MasterDashboard.jsx'
import ReturnsTracker from './components/ReturnsTracker.jsx'
import USStocksModule from './components/USStocksModule.jsx'
import IPOModule from './components/IPOModule.jsx'
import ETFModule from './components/ETFModule.jsx'
import CallOfTheDay from './components/CallOfTheDay.jsx'
import StreakBoard from './components/StreakBoard.jsx'
import TickerTape from './components/TickerTape.jsx'

const SEGMENTS = [
  { id: 'target', label: '17% Target', node: <TargetLoop /> },
  { id: 'signals', label: 'Signals', node: <MasterDashboard /> },
  {
    id: 'spotlight',
    label: 'Spotlight',
    node: (
      <div className="dashboard">
        <h2>Today's Spotlight</h2>
        <p className="section-sub">The board keeps score — every call, every streak, on the record.</p>
        <StreakBoard />
        <div style={{ height: 24 }} />
        <CallOfTheDay />
      </div>
    ),
  },
  { id: 'returns', label: 'Returns', node: <ReturnsTracker /> },
  { id: 'us', label: 'US Stocks', node: <USStocksModule /> },
  { id: 'ipo', label: 'IPOs', node: <IPOModule /> },
  { id: 'etf', label: 'ETFs', node: <ETFModule /> },
]

export default function App() {
  return (
    <>
      <DisclaimerHeader />
      <Deck segments={SEGMENTS} />
      <TickerTape />
    </>
  )
}
