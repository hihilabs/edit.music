import { useEffect, useState } from 'react'
import type { Location, TrackRef } from '../App.js'

interface Entry { name: string; type: 'dir' | 'file'; ext: string | null }

interface Props {
  location: Location
  selectedPath: string | null
  onSelect: (track: TrackRef) => void
  onPlay: (track: TrackRef) => void
}

export function FileBrowser({ location, selectedPath, onSelect, onPlay }: Props) {
  const [stack, setStack] = useState<string[]>([])
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(false)

  const currentPath = stack.join('/')

  useEffect(() => {
    setStack([])
  }, [location])

  useEffect(() => {
    setLoading(true)
    fetch(`/api/files/${location}?path=${encodeURIComponent(currentPath || '.')}`)
      .then(r => r.json())
      .then(setEntries)
      .finally(() => setLoading(false))
  }, [location, currentPath])

  function enter(name: string) {
    setStack(s => [...s, name])
  }

  function back() {
    setStack(s => s.slice(0, -1))
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto' }}>
      {/* Breadcrumb */}
      {stack.length > 0 && (
        <button onClick={back} style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          width: '100%', padding: '10px 16px',
          background: 'var(--surface)', border: 'none',
          borderBottom: '1px solid var(--border)',
          color: 'var(--accent)', fontSize: '13px', cursor: 'pointer', textAlign: 'left',
        }}>
          ← {stack[stack.length - 1]}
        </button>
      )}

      {loading && <p style={{ padding: '16px', color: 'var(--muted)', fontSize: '13px' }}>Loading…</p>}

      {entries.map(entry => {
        const fullPath = currentPath ? `${currentPath}/${entry.name}` : entry.name
        const isSelected = fullPath === selectedPath

        return (
          <div key={entry.name} style={{
            display: 'flex', alignItems: 'center',
            padding: '11px 16px',
            borderBottom: '1px solid var(--border)',
            background: isSelected ? '#1e1a3a' : 'transparent',
            gap: '10px',
          }}>
            <span style={{ fontSize: '16px' }}>
              {entry.type === 'dir' ? '📁' : entry.ext === '.flac' ? '🎼' : '🎵'}
            </span>
            <span
              style={{ flex: 1, fontSize: '14px', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              onClick={() => entry.type === 'dir' ? enter(entry.name) : onSelect({ path: fullPath, location, name: entry.name })}
            >
              {entry.name}
            </span>
            {entry.type === 'file' && (
              <button onClick={() => onPlay({ path: fullPath, location, name: entry.name })} style={{
                background: 'none', border: '1px solid var(--border)',
                color: 'var(--muted)', borderRadius: '4px',
                padding: '4px 8px', fontSize: '12px', cursor: 'pointer',
                flexShrink: 0,
              }}>▶</button>
            )}
          </div>
        )
      })}
    </div>
  )
}
