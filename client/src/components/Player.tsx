import { useEffect, useRef, useState } from 'react'
import type { Queue } from '../hooks/useQueue.js'
import { useSwipe } from '../hooks/useSwipe.js'

interface Props {
  queue: Queue
  onClose: () => void
}

export function Player({ queue, onClose }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [cover, setCover] = useState<string | null>(null)

  const track = queue.current!
  const src = `/api/audio/stream?path=${encodeURIComponent(track.path)}&location=${track.location}`

  useEffect(() => {
    fetch(`/api/tags?path=${encodeURIComponent(track.path)}&location=${track.location}`)
      .then(r => r.json())
      .then(d => setCover(d.cover ?? null))
    setProgress(0)
  }, [track.path, track.location])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    const onTime = () => setProgress(a.currentTime)
    const onLoad = () => setDuration(a.duration)
    const onEnd = () => { if (queue.hasNext) queue.next() }
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onLoad)
    a.addEventListener('ended', onEnd)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onLoad)
      a.removeEventListener('ended', onEnd)
    }
  }, [src])

  // Swipe left → next, swipe right → prev, swipe down → close
  const swipeHandlers = useSwipe({
    onSwipeLeft:  () => queue.hasNext && queue.next(),
    onSwipeRight: () => queue.hasPrev && queue.prev(),
    onSwipeDown:  onClose,
  })

  function togglePlay() {
    const a = audioRef.current!
    if (playing) { a.pause(); setPlaying(false) } else { a.play(); setPlaying(true) }
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    audioRef.current!.currentTime = Number(e.target.value)
  }

  function fmt(s: number) {
    if (!isFinite(s)) return '0:00'
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  return (
    <div
      {...swipeHandlers}
      style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
        padding: `12px 16px calc(12px + var(--safe-bottom))`,
        flexShrink: 0,
        touchAction: 'none',
      }}
    >
      <audio ref={audioRef} src={src} />

      {/* Queue position */}
      {queue.tracks.length > 1 && (
        <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '8px', textAlign: 'center' }}>
          {queue.index + 1} / {queue.tracks.length} — swipe ← → to skip
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {cover
          ? <img src={cover} style={{ width: 44, height: 44, borderRadius: '4px', objectFit: 'cover', flexShrink: 0 }} />
          : <div style={{ width: 44, height: 44, borderRadius: '4px', background: 'var(--border)', flexShrink: 0 }} />
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {track.name}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
            <span style={{ fontSize: '11px', color: 'var(--muted)', width: '32px' }}>{fmt(progress)}</span>
            <input type="range" min={0} max={duration || 1} value={progress} step={0.1}
              onChange={seek}
              style={{ flex: 1, accentColor: 'var(--accent)' }} />
            <span style={{ fontSize: '11px', color: 'var(--muted)', width: '32px', textAlign: 'right' }}>{fmt(duration)}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }}>
          {queue.hasPrev && (
            <button onClick={queue.prev} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '18px', cursor: 'pointer' }}>⏮</button>
          )}
          <button onClick={togglePlay} style={{
            width: 40, height: 40, borderRadius: '50%',
            background: 'var(--accent)', border: 'none', color: '#fff',
            fontSize: '16px', cursor: 'pointer',
          }}>{playing ? '⏸' : '▶'}</button>
          {queue.hasNext && (
            <button onClick={queue.next} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '18px', cursor: 'pointer' }}>⏭</button>
          )}
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '18px', cursor: 'pointer', marginLeft: '4px' }}>✕</button>
        </div>
      </div>
    </div>
  )
}
