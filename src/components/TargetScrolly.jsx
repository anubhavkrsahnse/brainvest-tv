import { useEffect, useRef, useState } from 'react'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ANNUAL_TARGET = 17 // the single parameter driving the whole scroll scene
const MONTHLY_TARGET = Math.pow(1 + ANNUAL_TARGET / 100, 1 / 12) - 1 // ~1.32%
const BASE_CAPITAL = 100000

// Apple-page-style scrollytelling: a 420vh runway with a pinned (sticky) scene.
// Scroll progress p ∈ [0,1] is the only animation clock — every element below
// (the big number, the compounding curve, the 12 milestone dots, the captions)
// is a pure function of p, which itself maps to one parameter: % of the 17%
// annualized target achieved.
export default function TargetScrolly() {
  const runwayRef = useRef(null)
  const [p, setP] = useState(0)

  useEffect(() => {
    const onScroll = () => {
      const el = runwayRef.current
      if (!el) return
      const total = el.offsetHeight - window.innerHeight
      const scrolled = Math.min(Math.max(-el.getBoundingClientRect().top, 0), total)
      setP(total > 0 ? scrolled / total : 0)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    onScroll()
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  const pct = (p * ANNUAL_TARGET).toFixed(1)
  const monthsElapsed = p * 12
  const portfolioValue = Math.round(BASE_CAPITAL * Math.pow(1 + MONTHLY_TARGET, monthsElapsed))

  // Compounding curve: y = 1.0132^x over 12 months, drawn into an 800x300 viewBox.
  const curvePoints = Array.from({ length: 121 }, (_, i) => {
    const m = (i / 120) * 12
    const growth = (Math.pow(1 + MONTHLY_TARGET, m) - 1) / (ANNUAL_TARGET / 100)
    const x = 40 + (m / 12) * 720
    const y = 270 - growth * 240
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const curvePath = `M ${curvePoints.join(' L ')}`

  const captions = [
    { from: 0.0, to: 0.28, text: `Start with ₹${BASE_CAPITAL.toLocaleString('en-IN')}. One goal. One number.` },
    { from: 0.28, to: 0.62, text: `Compound ~${(MONTHLY_TARGET * 100).toFixed(2)}% every month. Miss a month, the tracker shows it.` },
    { from: 0.62, to: 1.01, text: `12 green dots = ₹${Math.round(BASE_CAPITAL * (1 + ANNUAL_TARGET / 100)).toLocaleString('en-IN')}. That's the whole system.` }
  ]

  return (
    <section className="scrolly" ref={runwayRef} aria-label="17 percent annual target scroll story">
      <div className="scrolly-sticky">
        <div className="scrolly-kicker">The one parameter that matters</div>

        <div className="scrolly-number" data-testid="target-number">{pct}%</div>

        <div className="scrolly-sub">
          {captions.map((c, i) => (
            <span
              key={i}
              className="scrolly-caption"
              style={{ opacity: p >= c.from && p < c.to ? 1 : 0 }}
            >
              {c.text}
            </span>
          ))}
        </div>

        <svg className="scrolly-svg" viewBox="0 0 800 300" role="img" aria-label="Compounding growth curve">
          <line x1="40" y1="270" x2="760" y2="270" stroke="var(--border)" strokeWidth="1" />
          <line x1="40" y1="30" x2="760" y2="30" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 6" />
          <text x="762" y="34" fill="var(--muted)" fontSize="12">+{ANNUAL_TARGET}%</text>
          <path
            d={curvePath}
            fill="none"
            stroke="var(--green)"
            strokeWidth="3"
            strokeLinecap="round"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset={1 - p}
          />
          {p > 0.01 && (
            <circle
              cx={40 + p * 720}
              cy={270 - ((Math.pow(1 + MONTHLY_TARGET, monthsElapsed) - 1) / (ANNUAL_TARGET / 100)) * 240}
              r="6"
              fill="var(--green)"
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

        {p < 0.03 && <div className="scroll-hint">Scroll to compound ↓</div>}

        <div className="scrolly-source">
          Source: Internal target model (17% annualized ÷ 12 geometric monthly milestones). Illustration only — not a return promise.
        </div>
      </div>
    </section>
  )
}
