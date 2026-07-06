import { useEffect, useState } from 'react'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ANNUAL_TARGET = 17
const MONTHLY_TARGET = Math.pow(1 + ANNUAL_TARGET / 100, 1 / 12) - 1
const BASE_CAPITAL = 100000
const PLAY_MS = 8000  // 0 → 17% sweep
const HOLD_MS = 3000  // hold at 17% before looping

// Broadcast hero: the 17% compounding story auto-plays on a loop (no scrolling
// needed — the deck snaps pages, so the animation clock is time, not scroll).
// Click anywhere on it to pause/resume.
export default function TargetLoop() {
  const [p, setP] = useState(0)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    let raf
    let start = null
    const tick = t => {
      if (start === null) start = t - p * PLAY_MS // resume where we paused
      const elapsed = (t - start) % (PLAY_MS + HOLD_MS)
      setP(Math.min(elapsed / PLAY_MS, 1))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [paused]) // eslint-disable-line react-hooks/exhaustive-deps

  const pct = (p * ANNUAL_TARGET).toFixed(1)
  const monthsElapsed = p * 12
  const portfolioValue = Math.round(BASE_CAPITAL * Math.pow(1 + MONTHLY_TARGET, monthsElapsed))

  const curvePoints = Array.from({ length: 121 }, (_, i) => {
    const m = (i / 120) * 12
    const growth = (Math.pow(1 + MONTHLY_TARGET, m) - 1) / (ANNUAL_TARGET / 100)
    return `${(40 + (m / 12) * 720).toFixed(1)},${(270 - growth * 240).toFixed(1)}`
  })
  const curvePath = `M ${curvePoints.join(' L ')}`

  const captions = [
    { from: 0.0, to: 0.33, text: `Start with ₹${BASE_CAPITAL.toLocaleString('en-IN')}. One goal. One number.` },
    { from: 0.33, to: 0.66, text: `Compound ~${(MONTHLY_TARGET * 100).toFixed(2)}% every month. Miss a month, the tracker shows it.` },
    { from: 0.66, to: 1.01, text: `12 green dots = ₹${Math.round(BASE_CAPITAL * 1.17).toLocaleString('en-IN')}. That's the whole system.` },
  ]

  return (
    <div className="target-loop" onClick={() => setPaused(x => !x)} role="button" aria-label="17 percent target animation — click to pause">
      <div className="scrolly-kicker">The one parameter that matters {paused && '· ⏸ paused'}</div>
      <div className="scrolly-number" data-testid="target-number">{pct}%</div>
      <div className="scrolly-sub">
        {captions.map((c, i) => (
          <span key={i} className="scrolly-caption" style={{ opacity: p >= c.from && p < c.to ? 1 : 0 }}>{c.text}</span>
        ))}
      </div>
      <svg className="scrolly-svg" viewBox="0 0 800 300" role="img" aria-label="Compounding growth curve">
        <line x1="40" y1="270" x2="760" y2="270" stroke="var(--border)" strokeWidth="1" />
        <line x1="40" y1="30" x2="760" y2="30" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 6" />
        <text x="762" y="34" fill="var(--muted)" fontSize="12">+{ANNUAL_TARGET}%</text>
        <path d={curvePath} fill="none" stroke="var(--green)" strokeWidth="3" strokeLinecap="round"
          pathLength="1" strokeDasharray="1" strokeDashoffset={1 - p} />
        {p > 0.01 && (
          <circle
            cx={40 + p * 720}
            cy={270 - ((Math.pow(1 + MONTHLY_TARGET, monthsElapsed) - 1) / (ANNUAL_TARGET / 100)) * 240}
            r="6" fill="var(--green)"
          />
        )}
        <text x="40" y="292" fill="var(--muted)" fontSize="12">Month 0 · ₹{BASE_CAPITAL.toLocaleString('en-IN')}</text>
        <text x="640" y="292" fill="var(--muted)" fontSize="12">Month 12 · ₹{portfolioValue.toLocaleString('en-IN')} now</text>
      </svg>
      <div className="milestones">
        {MONTHS.map((m, i) => (
          <div key={m} className={`milestone ${monthsElapsed >= i + 1 ? 'lit' : ''}`}>
            <div className="dot" />
            <span>{m}</span>
            <span>+{(MONTHLY_TARGET * 100).toFixed(2)}%</span>
          </div>
        ))}
      </div>
      <div className="scrolly-source">
        Source: Internal target model (17% annualized ÷ 12 geometric monthly milestones). Illustration only — not a return promise.
      </div>
    </div>
  )
}
