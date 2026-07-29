import { useState, useEffect } from 'react'

// True when the viewport is narrower than `bp` (tablet/mobile). Client-only SPA, so window is always
// present; the guard keeps it safe if ever pre-rendered. Inline styles read this to collapse grids.
export function useIsNarrow(bp = 900) {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < bp : false
  )
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < bp)
    window.addEventListener('resize', onResize)
    onResize()
    return () => window.removeEventListener('resize', onResize)
  }, [bp])
  return narrow
}
