import { useState, useCallback } from 'react'
import type { TrackRef } from '../App.js'

export interface Queue {
  tracks: TrackRef[]
  index: number
  current: TrackRef | null
  add: (track: TrackRef) => void
  playNow: (track: TrackRef) => void
  next: () => void
  prev: () => void
  clear: () => void
  hasNext: boolean
  hasPrev: boolean
}

export function useQueue(): Queue {
  const [tracks, setTracks] = useState<TrackRef[]>([])
  const [index, setIndex] = useState(-1)

  const current = index >= 0 && index < tracks.length ? tracks[index] : null

  const playNow = useCallback((track: TrackRef) => {
    setTracks(q => {
      const existing = q.findIndex(t => t.path === track.path && t.location === track.location)
      if (existing >= 0) { setIndex(existing); return q }
      const next = [...q, track]
      setIndex(next.length - 1)
      return next
    })
  }, [])

  const add = useCallback((track: TrackRef) => {
    setTracks(q => {
      if (q.some(t => t.path === track.path && t.location === track.location)) return q
      const next = [...q, track]
      if (index < 0) setIndex(0)
      return next
    })
  }, [index])

  const next = useCallback(() => setIndex(i => Math.min(i + 1, tracks.length - 1)), [tracks.length])
  const prev = useCallback(() => setIndex(i => Math.max(i - 1, 0)), [])
  const clear = useCallback(() => { setTracks([]); setIndex(-1) }, [])

  return {
    tracks, index, current,
    add, playNow, next, prev, clear,
    hasNext: index < tracks.length - 1,
    hasPrev: index > 0,
  }
}
