import { useState } from 'react'

// Curiosity blur: ₹ amounts ship blurred; a click peeks, another click re-hides.
// Percentages are intentionally NOT wrapped in this — viewers see the % return
// but must watch (or the host must click) to see the actual money.
export default function BlurredValue({ children, label = 'hidden amount' }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <span
      className={`blur-val ${revealed ? 'revealed' : ''}`}
      onClick={e => { e.stopPropagation(); setRevealed(x => !x) }}
      title={revealed ? 'Click to hide' : 'Click to reveal'}
      role="button"
      aria-label={revealed ? String(children) : label}
    >
      {children}
    </span>
  )
}
