import { useEffect, useRef, useState } from 'react'

// Full-page segment deck: one small scroll snaps to the next complete page
// (CSS scroll-snap does the heavy lifting). Right-edge dots + arrow keys +
// clicking a dot jump between segments — built for screen-sharing.
export default function Deck({ segments }) {
  const deckRef = useRef(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    const deck = deckRef.current
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) setActive(+e.target.dataset.idx) }),
      { root: deck, threshold: 0.55 }
    )
    deck.querySelectorAll('.segment').forEach(s => obs.observe(s))
    return () => obs.disconnect()
  }, [])

  const go = i => {
    const deck = deckRef.current
    if (!deck) return
    setActive(i) // highlight the target dot immediately, don't wait on the observer
    const start = deck.scrollTop
    const end = i * deck.clientHeight
    if (Math.abs(end - start) < 2) return
    // Manual rAF tween on scrollTop. Native smooth-scroll is blocked by
    // scroll-snap-type: mandatory, so we relax snap during the animation and
    // step scrollTop numerically — reliable across every browser engine.
    deck.style.scrollSnapType = 'none'
    const t0 = performance.now()
    const ease = t => 1 - Math.pow(1 - t, 3)
    const tick = () => {
      const p = Math.min((performance.now() - t0) / 450, 1)
      deck.scrollTop = start + (end - start) * ease(p)
      if (p < 1) setTimeout(tick, 16)
      else deck.style.scrollSnapType = ''
    }
    tick()
  }

  useEffect(() => {
    const onKey = e => {
      if (e.target.closest('input, select, textarea')) return
      if (['ArrowDown', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(Math.min(active + 1, segments.length - 1)) }
      if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); go(Math.max(active - 1, 0)) }
      if (e.key === 'Home') { e.preventDefault(); go(0) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, segments.length])

  return (
    <>
      <div className="deck" ref={deckRef}>
        {segments.map((s, i) => (
          <section className="segment" data-idx={i} id={s.id} key={s.id} aria-label={s.label}>
            {s.node}
          </section>
        ))}
      </div>
      <nav className="seg-dots" aria-label="Sections">
        {segments.map((s, i) => (
          <button key={s.id} className={i === active ? 'active' : ''} onClick={() => go(i)}>
            <span className="lbl">{s.label}</span>
            <span className="dot" />
          </button>
        ))}
      </nav>
      <div className="seg-counter">{active + 1} / {segments.length}</div>
    </>
  )
}
