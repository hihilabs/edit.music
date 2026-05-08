import { useState } from 'react'
import { FileBrowser } from './components/FileBrowser.js'
import { TagEditor } from './components/TagEditor.js'
import { Player } from './components/Player.js'
import { useQueue } from './hooks/useQueue.js'

export type Location = 'music' | 'recycle'

export interface TrackRef {
  path: string
  location: Location
  name: string
}

export function App() {
  const [activeLocation, setActiveLocation] = useState<Location>('music')
  const [selectedTrack, setSelectedTrack] = useState<TrackRef | null>(null)
  const queue = useQueue()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <nav style={{
        display: 'flex',
        borderBottom: '1px solid var(--border)',
        paddingTop: 'var(--safe-top)',
        flexShrink: 0,
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

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <FileBrowser
          location={activeLocation}
          onSelect={setSelectedTrack}
          onPlay={track => queue.playNow(track)}
          onAddToQueue={track => queue.add(track)}
          selectedPath={selectedTrack?.path ?? null}
        />
        {selectedTrack && (
          <TagEditor track={selectedTrack} onClose={() => setSelectedTrack(null)} />
        )}
      </div>

      {queue.current && (
        <Player queue={queue} onClose={queue.clear} />
      )}
    </div>
  )
}
