import { useRef } from 'react'

interface SwipeHandlers {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  threshold?: number
}

export function useSwipe({ onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold = 50 }: SwipeHandlers) {
  const start = useRef<{ x: number; y: number } | null>(null)

  return {
    onTouchStart: (e: React.TouchEvent) => {
      start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!start.current) return
      const dx = e.changedTouches[0].clientX - start.current.x
      const dy = e.changedTouches[0].clientY - start.current.y
      const adx = Math.abs(dx)
      const ady = Math.abs(dy)
      if (Math.max(adx, ady) < threshold) return
      if (adx > ady) {
        if (dx < 0) onSwipeLeft?.()
        else onSwipeRight?.()
      } else {
        if (dy < 0) onSwipeUp?.()
        else onSwipeDown?.()
      }
      start.current = null
    },
  }
}
