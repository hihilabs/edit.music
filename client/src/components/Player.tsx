import { useEffect, useRef, useState } from 'react'
import type { TrackRef } from '../App.js'

interface Props {
  track: TrackRef
  onClose: () => void
}

export function Player({ track, onClose }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [cover, setCover] = useState<string | null>(null)

  const src = `/api/audio/stream?path=${encodeURIComponent(track.path)}&location=${track.location}`

  useEffect(() => {
    fetch(`/api/tags?path=${encodeURIComponent(track.path)}&location=${track.location}`)
      .then(r => r.json())
      .then(d => setCover(d.cover ?? null))
  }, [track.path, track.location])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.play().then(() => setPlaying(true)).catch(() => {})
    const onTime = () => setProgress(a.currentTime)
    const onLoad = () => setDuration(a.duration)
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onLoad)
    return () => { a.removeEventListener('timeupdate', onTime); a.removeEventListener('loadedmetadata', onLoad) }
  }, [src])

  function togglePlay() {
    const a = audioRef.current!
    if (playing) { a.pause(); setPlaying(false) } else { a.play(); setPlaying(true) }
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const a = audioRef.current!
    a.currentTime = Number(e.target.value)
  }

  function fmt(s: number) {
    const m = Math.floor(s / 60)
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      background: 'var(--surface)',
      padding: `12px 16px calc(12px + var(--safe-bottom))`,
    }}>
      <audio ref={audioRef} src={src} />
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
        <button onClick={togglePlay} style={{
          width: 40, height: 40, borderRadius: '50%',
          background: 'var(--accent)', border: 'none', color: '#fff',
          fontSize: '16px', cursor: 'pointer', flexShrink: 0,
        }}>{playing ? '⏸' : '▶'}</button>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: 'var(--muted)',
          fontSize: '18px', cursor: 'pointer', flexShrink: 0,
        }}>✕</button>
      </div>
    </div>
  )
}
