import { useState } from 'react'
import { FileBrowser } from './components/FileBrowser.js'
import { TagEditor } from './components/TagEditor.js'
import { Player } from './components/Player.js'

export type Location = 'music' | 'recycle'

export interface TrackRef {
  path: string
  location: Location
  name: string
}

export function App() {
  const [activeLocation, setActiveLocation] = useState<Location>('music')
  const [selectedTrack, setSelectedTrack] = useState<TrackRef | null>(null)
  const [playerTrack, setPlayerTrack] = useState<TrackRef | null>(null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar */}
      <nav style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        paddingTop: 'var(--safe-top)',
      }}>
        {(['music', 'recycle'] as Location[]).map(loc => (
          <button key={loc} onClick={() => setActiveLocation(loc)} style={{
            flex: 1, padding: '12px', background: 'none', border: 'none',
            color: activeLocation === loc ? 'var(--accent)' : 'var(--muted)',
            borderBottom: activeLocation === loc ? '2px solid var(--accent)' : '2px solid transparent',
            fontSize: '14px', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize',
          }}>
            {loc === 'recycle' ? '🗑 Recycle Bin' : '🎵 Library'}
          </button>
        ))}
      </nav>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <FileBrowser
          location={activeLocation}
          onSelect={setSelectedTrack}
          onPlay={setPlayerTrack}
          selectedPath={selectedTrack?.path ?? null}
        />
        {selectedTrack && (
          <TagEditor track={selectedTrack} onClose={() => setSelectedTrack(null)} />
        )}
      </div>

      {/* Sticky player */}
      {playerTrack && (
        <Player track={playerTrack} onClose={() => setPlayerTrack(null)} />
      )}
    </div>
  )
}
