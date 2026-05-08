import { useEffect, useState } from 'react'
import type { TrackRef } from '../App.js'

interface Tags {
  title: string | null
  artist: string | null
  album: string | null
  year: number | null
  track: number | null
  genre: string | null
  duration: number | null
  bitrate: number | null
  codec: string | null
  cover: string | null
}

interface Props {
  track: TrackRef
  onClose: () => void
}

export function TagEditor({ track, onClose }: Props) {
  const [tags, setTags] = useState<Tags | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const isRecycle = track.location === 'recycle'

  useEffect(() => {
    setTags(null)
    setSaved(false)
    fetch(`/api/tags?path=${encodeURIComponent(track.path)}&location=${track.location}`)
      .then(r => r.json())
      .then(setTags)
  }, [track.path, track.location])

  function update(field: keyof Tags, value: string) {
    setTags(t => t ? { ...t, [field]: value || null } : t)
    setSaved(false)
  }

  async function save() {
    if (!tags || isRecycle) return
    setSaving(true)
    const res = await fetch(`/api/tags?path=${encodeURIComponent(track.path)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: tags.title, artist: tags.artist, album: tags.album, year: tags.year, track: tags.track, genre: tags.genre }),
    })
    setSaving(false)
    if (res.ok) setSaved(true)
  }

  function fmt(s: number) {
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  }

  return (
    <div style={{
      borderTop: '2px solid var(--accent)',
      background: 'var(--surface)',
      padding: '16px',
      overflowY: 'auto',
      maxHeight: '55vh',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {tags?.cover && <img src={tags.cover} style={{ width: 36, height: 36, borderRadius: '3px', objectFit: 'cover' }} />}
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent)' }}>
            {isRecycle ? '🗑 Recycle Bin (read-only)' : 'Edit Tags'}
          </p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '18px', cursor: 'pointer' }}>✕</button>
      </div>

      {!tags && <p style={{ color: 'var(--muted)', fontSize: '13px' }}>Loading…</p>}

      {tags && (
        <>
          {tags.duration && (
            <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '12px' }}>
              {fmt(tags.duration)} · {tags.codec ?? '?'} · {tags.bitrate ? Math.round(tags.bitrate / 1000) + ' kbps' : ''}
            </p>
          )}

          {(['title', 'artist', 'album', 'genre'] as const).map(field => (
            <div key={field} style={{ marginBottom: '10px' }}>
              <label style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{field}</label>
              <input
                value={tags[field] ?? ''}
                onChange={e => update(field, e.target.value)}
                disabled={isRecycle}
                style={{
                  display: 'block', width: '100%', marginTop: '4px',
                  background: isRecycle ? 'transparent' : 'var(--bg)',
                  border: '1px solid var(--border)', borderRadius: '4px',
                  color: 'var(--text)', padding: '8px 10px', fontSize: '14px',
                  opacity: isRecycle ? 0.6 : 1,
                }}
              />
            </div>
          ))}

          <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
            {(['year', 'track'] as const).map(field => (
              <div key={field} style={{ flex: 1 }}>
                <label style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{field}</label>
                <input
                  value={tags[field] ?? ''}
                  onChange={e => update(field, e.target.value)}
                  disabled={isRecycle}
                  type="number"
                  style={{
                    display: 'block', width: '100%', marginTop: '4px',
                    background: isRecycle ? 'transparent' : 'var(--bg)',
                    border: '1px solid var(--border)', borderRadius: '4px',
                    color: 'var(--text)', padding: '8px 10px', fontSize: '14px',
                    opacity: isRecycle ? 0.6 : 1,
                  }}
                />
              </div>
            ))}
          </div>

          {!isRecycle && (
            <button onClick={save} disabled={saving} style={{
              width: '100%', padding: '10px',
              background: saved ? '#1a3a1a' : 'var(--accent)',
              border: 'none', borderRadius: '6px',
              color: '#fff', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            }}>
              {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Tags'}
            </button>
          )}
        </>
      )}
    </div>
  )
}
