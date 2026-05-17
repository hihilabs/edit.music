import { useEffect, useRef, useState } from 'react'

interface GenreRow { genre: string; count: number }
type GenreMap = Record<string, string>

interface ScanProgress {
  folders: number
  artists: number
  tracks: number
  genres: number
  current: string
}

export function GenreManager() {
  const [genres, setGenres] = useState<GenreRow[]>([])
  const [scannedAt, setScannedAt] = useState<string | null>(null)
  const [map, setMap] = useState<GenreMap>({})
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState(false)
  const [progress, setProgress] = useState<ScanProgress | null>(null)
  const [filter, setFilter] = useState('')
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [normalizePreview, setNormalizePreview] = useState<{ changed: number; total: number } | null>(null)
  const [normalizing, setNormalizing] = useState(false)
  const [normalizeDone, setNormalizeDone] = useState(false)
  const [tokenizePreview, setTokenizePreview] = useState<{ changed: number; total: number; examples: { original: string; tokens: string[] }[] } | null>(null)
  const [tokenizing, setTokenizing] = useState(false)
  const [tokenizeDone, setTokenizeDone] = useState(false)
  const [tokenizeFailed, setTokenizeFailed] = useState(0)
  const tokPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [phrases, setPhrases] = useState<string[]>([])
  const [phraseInput, setPhraseInput] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const normPollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    fetch('/api/genres/map').then(r => r.json()).then(setMap).catch(() => {})
    fetch('/api/genres/phrases').then(r => r.json()).then(setPhrases).catch(() => {})
    fetch('/api/genres/scan').then(r => r.json()).then(state => {
      if (state.result) { setGenres(state.result); setScannedAt(state.scannedAt) }
    }).catch(() => {})
    // Restore normalize state if page was refreshed mid-run or with pending dry result
    fetch('/api/genres/normalize').then(r => r.json()).then(state => {
      if (state.running) {
        // Re-attach polling to in-progress normalize
        setNormalizing(true)
        const poll = setInterval(async () => {
          try {
            const s = await fetch('/api/genres/normalize').then(r => r.json())
            if (!s.running) {
              clearInterval(poll)
              setNormalizing(false)
              if (s.dry && s.dryResult) setNormalizePreview(s.dryResult)
              else if (!s.dry && s.done) { setNormalizeDone(true); runTokenize() }
            }
          } catch { clearInterval(poll); setNormalizing(false) }
        }, 2000)
        normPollRef.current = poll
      } else if (!state.running && state.dryResult?.changed > 0) {
        setNormalizePreview(state.dryResult)
      }
    }).catch(() => {})
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (normPollRef.current) clearInterval(normPollRef.current)
      if (tokPollRef.current) clearInterval(tokPollRef.current)
    }
  }, [])

  function scan(incremental = false) {
    if (pollRef.current) clearInterval(pollRef.current)
    setScanning(true)
    setScanError(false)
    setProgress({ folders: 0, artists: 0, tracks: 0, genres: 0, current: '' })
    if (!incremental) setGenres([])
    setNormalizePreview(null)
    setNormalizeDone(false)
    setTokenizePreview(null)
    setTokenizeDone(false)

    fetch('/api/genres/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ incremental }),
    }).catch(() => {})

    pollRef.current = setInterval(async () => {
      try {
        const state = await fetch('/api/genres/scan').then(r => r.json())
        if (state.progress) setProgress(state.progress)
        if (!state.running) {
          clearInterval(pollRef.current!)
          pollRef.current = null
          if (state.result) {
            setGenres(state.result)
            setScannedAt(state.scannedAt)
            setProgress(null)
            setScanning(false)
          } else {
            setProgress(null)
            setScanning(false)
            setScanError(true)
          }
        }
      } catch {
        clearInterval(pollRef.current!)
        pollRef.current = null
        setScanning(false)
        setProgress(null)
        setScanError(true)
      }
    }, 2000)
  }

  async function saveMapping(variant: string, canonical: string) {
    if (!canonical.trim()) { await removeMapping(variant); return }
    await fetch('/api/genres/map', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant, canonical: canonical.trim() }),
    })
    setMap(m => ({ ...m, [variant.toLowerCase()]: canonical.trim() }))
    setEditing(e => { const n = { ...e }; delete n[variant]; return n })
  }

  async function removeMapping(variant: string) {
    await fetch(`/api/genres/map?variant=${encodeURIComponent(variant)}`, { method: 'DELETE' })
    setMap(m => { const n = { ...m }; delete n[variant.toLowerCase()]; return n })
  }

  async function discardGenre(variant: string) {
    await fetch('/api/genres/map', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ variant, canonical: '' }),
    })
    setMap(m => ({ ...m, [variant.toLowerCase()]: '' }))
  }

  async function addPhrase(phrase: string) {
    const trimmed = phrase.trim()
    if (!trimmed) return
    const updated = await fetch('/api/genres/phrases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phrase: trimmed }),
    }).then(r => r.json()).catch(() => null)
    if (updated) setPhrases(updated)
    setPhraseInput('')
  }

  async function removePhrase(phrase: string) {
    const updated = await fetch(`/api/genres/phrases?phrase=${encodeURIComponent(phrase)}`, { method: 'DELETE' })
      .then(r => r.json()).catch(() => null)
    if (updated) setPhrases(updated)
  }

  async function previewNormalize() {
    if (normPollRef.current) clearInterval(normPollRef.current)
    setNormalizing(true)
    setNormalizePreview(null)
    await fetch('/api/genres/normalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dry: true }),
    })
    normPollRef.current = setInterval(async () => {
      try {
        const state = await fetch('/api/genres/normalize').then(r => r.json())
        if (!state.running) {
          clearInterval(normPollRef.current!); normPollRef.current = null
          setNormalizing(false)
          if (state.dryResult) setNormalizePreview(state.dryResult)
        }
      } catch {
        clearInterval(normPollRef.current!); normPollRef.current = null
        setNormalizing(false)
      }
    }, 2000)
  }

  function startTokPoll() {
    if (tokPollRef.current) clearInterval(tokPollRef.current)
    tokPollRef.current = setInterval(async () => {
      try {
        const s = await fetch('/api/genres/tokenize').then(r => r.json())
        if (!s.running) {
          clearInterval(tokPollRef.current!); tokPollRef.current = null
          setTokenizing(false)
          if (s.dry && s.dryResult) setTokenizePreview(s.dryResult)
          else if (!s.dry && s.done) { setTokenizeDone(true); setTokenizeFailed(s.failed ?? 0); scan(true) }
        }
      } catch {
        clearInterval(tokPollRef.current!); tokPollRef.current = null
        setTokenizing(false)
      }
    }, 2000)
  }

  async function previewTokenize() {
    setTokenizing(true)
    setTokenizePreview(null)
    await fetch('/api/genres/tokenize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dry: true }),
    })
    startTokPoll()
  }

  async function runTokenize() {
    setTokenizing(true)
    setTokenizePreview(null)
    await fetch('/api/genres/tokenize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dry: false }),
    })
    startTokPoll()
  }

  async function runNormalize() {
    if (normPollRef.current) clearInterval(normPollRef.current)
    setNormalizing(true)
    setNormalizePreview(null)
    await fetch('/api/genres/normalize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dry: false }),
    })
    normPollRef.current = setInterval(async () => {
      try {
        const state = await fetch('/api/genres/normalize').then(r => r.json())
        if (!state.running) {
          clearInterval(normPollRef.current!); normPollRef.current = null
          setNormalizing(false)
          setNormalizeDone(true)
          // auto-run split to separate any compound tags (commas/separators) left after normalize
          runTokenize()
        }
      } catch {
        clearInterval(normPollRef.current!); normPollRef.current = null
        setNormalizing(false)
      }
    }, 2000)
  }

  const filtered = genres.filter(g =>
    !filter || g.genre.toLowerCase().includes(filter.toLowerCase())
  )

  const canonicals = [...new Set(Object.values(map))].sort()

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

      {/* Toolbar */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border)',
        display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap',
        position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1,
        paddingBottom: '12px',
      }}>
        <button onClick={() => scan(false)} disabled={scanning} style={{
          padding: '7px 14px', borderRadius: '5px', fontSize: '13px', fontWeight: 600,
          background: 'var(--accent)', border: 'none', color: '#fff', cursor: 'pointer',
          opacity: scanning ? 0.7 : 1,
        }}>
          {scanning ? 'Scanning…' : genres.length > 0 ? '↺ Rescan' : 'Scan Library'}
        </button>
        {scannedAt && !scanning && (
          <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
            {(() => {
              const diff = Date.now() - new Date(scannedAt).getTime()
              const h = Math.floor(diff / 3600000)
              const d = Math.floor(diff / 86400000)
              return d > 0 ? `${d}d ago` : h > 0 ? `${h}h ago` : 'just now'
            })()}
          </span>
        )}

        {genres.length > 0 && !scanning && (
          <>
            <input
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder={`Filter ${genres.length} genres…`}
              style={{
                flex: 1, minWidth: '120px', background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: '4px', color: 'var(--text)', padding: '7px 10px', fontSize: '13px',
              }}
            />
            {normalizePreview === null && !normalizeDone && (
              <button onClick={previewNormalize} disabled={normalizing} style={{
                padding: '7px 14px', borderRadius: '5px', fontSize: '13px',
                background: 'none', border: '1px solid var(--accent)', color: 'var(--accent)', cursor: 'pointer',
              }}>
                {normalizing ? '…' : '✦ Normalize'}
              </button>
            )}
            {normalizePreview !== null && (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  {normalizePreview.changed} tracks will change
                </span>
                <button onClick={runNormalize} disabled={normalizing} style={{
                  padding: '7px 12px', borderRadius: '5px', fontSize: '13px', fontWeight: 600,
                  background: '#22c55e', border: 'none', color: '#fff', cursor: 'pointer',
                }}>
                  {normalizing ? '…' : 'Confirm'}
                </button>
                <button onClick={() => setNormalizePreview(null)} style={{
                  background: 'none', border: 'none', color: 'var(--muted)', fontSize: '16px', cursor: 'pointer',
                }}>✕</button>
              </div>
            )}
            {normalizeDone && (
              <span style={{ fontSize: '12px', color: '#22c55e' }}>✓ Library normalized</span>
            )}

            {tokenizePreview === null && !tokenizeDone && (
              <button onClick={previewTokenize} disabled={tokenizing} style={{
                padding: '7px 14px', borderRadius: '5px', fontSize: '13px',
                background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer',
              }}>
                {tokenizing ? '…' : '✂ Split'}
              </button>
            )}
            {tokenizePreview !== null && (
              <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                  {tokenizePreview.changed.toLocaleString()} tracks will split ↓
                </span>
                <button onClick={runTokenize} disabled={tokenizing} style={{
                  padding: '7px 12px', borderRadius: '5px', fontSize: '13px', fontWeight: 600,
                  background: '#22c55e', border: 'none', color: '#fff', cursor: 'pointer',
                }}>
                  {tokenizing ? '…' : 'Confirm'}
                </button>
                <button onClick={() => setTokenizePreview(null)} style={{
                  padding: '7px 10px', borderRadius: '5px', fontSize: '12px',
                  background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer',
                }}>✕ Clear</button>
              </div>
            )}
            {tokenizeDone && (
              <span style={{ fontSize: '12px', color: tokenizeFailed > 0 ? '#eab308' : '#22c55e' }}>
                ✓ Genres split{tokenizeFailed > 0 ? ` (${tokenizeFailed} failed — check server log)` : ''}
              </span>
            )}
          </>
        )}

      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', padding: '4px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ color: '#eab308' }}>●</span> mapped — Normalize will rewrite on disk
        </span>
        <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ color: '#ef4444' }}>●</span> discarded — Normalize will delete this tag
        </span>
        <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span style={{ color: 'var(--accent)' }}>✂</span> compound — Split will separate
        </span>
        <span style={{ fontSize: '10px', color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: '5px' }}>
          <span>✓</span> already canonical — no action needed
        </span>
      </div>

      {/* Split preview examples panel */}
      {tokenizePreview !== null && tokenizePreview.examples.length > 0 && (
        <div style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg)', padding: '12px 16px' }}>
          <p style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
            Split preview — {tokenizePreview.changed.toLocaleString()} of {tokenizePreview.total.toLocaleString()} tracks affected
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {tokenizePreview.examples.map((ex, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                <span style={{ color: 'var(--muted)', minWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {ex.original}
                </span>
                <span style={{ color: 'var(--border)' }}>→</span>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                  {ex.tokens.map(t => (
                    <span key={t} style={{
                      background: 'var(--surface)', border: '1px solid var(--accent)',
                      borderRadius: '4px', padding: '2px 8px', fontSize: '12px', color: 'var(--accent)',
                    }}>{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '10px', fontStyle: 'italic' }}>
            Showing {tokenizePreview.examples.length} examples. Protected phrases stay whole.
          </p>
        </div>
      )}

      {/* Live scan progress */}
      {scanning && progress && (
        <div style={{ padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Indeterminate bar */}
          <div style={{ background: 'var(--border)', borderRadius: '4px', height: '3px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: '35%',
              background: 'var(--accent)',
              animation: 'scan-slide 1.4s ease-in-out infinite',
            }} />
          </div>

          {/* Stats grid */}
          <div style={{ display: 'flex', justifyContent: 'space-around' }}>
            {[
              { label: 'Artists', val: progress.artists },
              { label: 'Folders', val: progress.folders },
              { label: 'Tracks',  val: progress.tracks  },
              { label: 'Genres',  val: progress.genres  },
            ].map(({ label, val }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '28px', fontWeight: 700,
                  color: 'var(--accent)',
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.02em',
                  lineHeight: 1,
                  marginBottom: '6px',
                }}>
                  {val.toLocaleString()}
                </div>
                <div style={{
                  fontSize: '10px', color: 'var(--muted)',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Current artist */}
          {progress.current && (
            <p style={{
              textAlign: 'center', fontSize: '13px', color: 'var(--muted)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              <span style={{ color: 'var(--accent)', marginRight: '6px' }}>♪</span>
              {progress.current}
            </p>
          )}
        </div>
      )}

      {/* Protected phrases */}
      {!scanning && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          <p style={{ fontSize: '11px', color: 'var(--muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Protected phrases (✂ Split keeps these whole)
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
            {phrases.map(p => (
              <div key={p} style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: '4px', padding: '3px 8px', fontSize: '12px',
              }}>
                <span>{p}</span>
                <button onClick={() => removePhrase(p)} style={{
                  background: 'none', border: 'none', color: 'var(--muted)',
                  fontSize: '12px', cursor: 'pointer', padding: '0 0 0 4px', lineHeight: 1,
                }}>✕</button>
              </div>
            ))}
            <input
              value={phraseInput}
              onChange={e => setPhraseInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addPhrase(phraseInput) }}
              placeholder="Add phrase…"
              style={{
                background: 'var(--bg)', border: '1px solid var(--border)',
                borderRadius: '4px', color: 'var(--text)', padding: '3px 8px', fontSize: '12px', width: '120px',
              }}
            />
          </div>
        </div>
      )}

      {/* Active mappings */}
      {!scanning && genres.length > 0 && Object.keys(map).length > 0 && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <p style={{ fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              Active mappings
            </p>
            <button
              title="Remove mappings whose source variant no longer exists in the library"
              onClick={async () => {
                const res = await fetch('/api/genres/map/prune', { method: 'POST' }).then(r => r.json())
                setMap(res.map)
              }}
              style={{
                background: 'none', border: '1px solid var(--border)', borderRadius: '4px',
                color: 'var(--muted)', padding: '2px 7px', fontSize: '10px', cursor: 'pointer',
              }}
            >Prune dormant</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {Object.entries(map).map(([variant, canonical]) => {
              const isDiscard = canonical === ''
              return (
                <div key={variant} style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  background: isDiscard ? 'rgba(239,68,68,0.08)' : 'var(--surface)',
                  border: `1px solid ${isDiscard ? 'rgba(239,68,68,0.4)' : 'var(--border)'}`,
                  borderRadius: '4px', padding: '3px 8px', fontSize: '12px',
                }}>
                  <span style={{ color: 'var(--muted)' }}>{variant}</span>
                  <span style={{ color: isDiscard ? '#ef4444' : 'var(--accent)' }}>→</span>
                  <span style={{ color: isDiscard ? '#ef4444' : 'inherit' }}>{isDiscard ? '🗑 discard' : canonical}</span>
                  <button onClick={() => removeMapping(variant)} style={{
                    background: 'none', border: 'none', color: 'var(--muted)',
                    fontSize: '12px', cursor: 'pointer', padding: '0 0 0 4px', lineHeight: 1,
                  }}>✕</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Error state */}
      {!scanning && scanError && genres.length === 0 && (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: '14px' }}>
          <div style={{ fontSize: '28px', marginBottom: '12px' }}>⚠️</div>
          <p style={{ color: '#ef4444', marginBottom: '8px' }}>Scan connection dropped.</p>
          <p style={{ fontSize: '12px' }}>Server may need a restart — run <code style={{ background: 'var(--surface)', padding: '2px 5px', borderRadius: '3px' }}>dev.sh</code> then try again.</p>
        </div>
      )}

      {/* Empty state */}
      {!scanning && !scanError && genres.length === 0 && (
        <div style={{ padding: '60px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: '14px' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏷</div>
          <p>Scan your library to see all genre tags.</p>
          <p style={{ fontSize: '12px', marginTop: '6px' }}>Takes ~1–2 min for a 4TB library.</p>
        </div>
      )}

      {/* Genre table */}
      {!scanning && filtered.map(({ genre, count }) => {
        const key = genre.toLowerCase()
        const mapped = map[key]
        const isDiscard = mapped === ''
        const isMapped = mapped !== undefined
        // identity mapping = tag is already in canonical form, normalize won't touch it
        const isCompound = /[,;\/|]/.test(genre)
        const isCanonical = isMapped && !isDiscard && !isCompound && mapped.toLowerCase() === key
        const isPending = isMapped && !isDiscard && !isCanonical
        const editVal = editing[genre]
        const isEditing = editVal !== undefined

        return (
          <div key={genre} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            padding: '10px 16px', borderBottom: '1px solid var(--border)',
            background: isDiscard ? 'rgba(239,68,68,0.05)' : isCompound ? 'rgba(124,106,247,0.05)' : isPending ? 'rgba(234,179,8,0.05)' : 'transparent',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {isDiscard  && <span style={{ color: '#ef4444', fontSize: '10px' }}>●</span>}
                {isPending  && !isCompound && <span style={{ color: '#eab308', fontSize: '10px' }}>●</span>}
                {isCompound && <span style={{ color: 'var(--accent)', fontSize: '10px' }}>✂</span>}
                {isCanonical && <span style={{ color: 'var(--muted)', fontSize: '10px' }}>✓</span>}
                <span style={{ fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isDiscard ? 'line-through' : 'none', color: isDiscard ? 'var(--muted)' : 'inherit' }}>
                  {genre}
                </span>
                {isPending && (
                  <span style={{ fontSize: '12px', color: 'var(--muted)', flexShrink: 0 }}>
                    → <span style={{ color: 'var(--accent)' }}>{mapped}</span>
                  </span>
                )}
                {isDiscard && (
                  <span style={{ fontSize: '12px', color: 'var(--muted)', flexShrink: 0 }}>
                    → <span style={{ color: '#ef4444' }}>discard</span>
                  </span>
                )}
              </div>
            </div>

            <span style={{ fontSize: '12px', color: 'var(--muted)', flexShrink: 0 }}>{count.toLocaleString()}</span>

            {isEditing ? (
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                <input
                  list="canonicals"
                  value={editVal}
                  onChange={e => setEditing(ed => ({ ...ed, [genre]: e.target.value }))}
                  placeholder="Canonical genre…"
                  autoFocus
                  style={{
                    width: '140px', background: 'var(--bg)', border: '1px solid var(--accent)',
                    borderRadius: '4px', color: 'var(--text)', padding: '5px 8px', fontSize: '12px',
                  }}
                />
                <datalist id="canonicals">
                  {canonicals.map(c => <option key={c} value={c} />)}
                </datalist>
                <button
                  onClick={() => saveMapping(genre, editVal)}
                  disabled={!editVal.trim()}
                  style={{ background: 'var(--accent)', border: 'none', borderRadius: '4px', color: '#fff', padding: '5px 8px', fontSize: '12px', cursor: 'pointer' }}>
                  ✓
                </button>
                <button
                  onClick={() => { discardGenre(genre); setEditing(e => { const n = { ...e }; delete n[genre]; return n }) }}
                  title="Remove genre tag from all files on next Normalize"
                  style={{ background: 'none', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '4px', color: '#ef4444', padding: '5px 7px', fontSize: '12px', cursor: 'pointer' }}>
                  🗑
                </button>
                <button
                  onClick={() => setEditing(e => { const n = { ...e }; delete n[genre]; return n })}
                  style={{ background: 'none', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--muted)', padding: '5px 7px', fontSize: '12px', cursor: 'pointer' }}>
                  ✕
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                {!isMapped && !isCompound && (
                  <button
                    onClick={() => saveMapping(genre, genre)}
                    title="Already correct — mark as canonical"
                    style={{
                      background: 'none', border: '1px solid rgba(34,197,94,0.4)', borderRadius: '4px',
                      color: '#22c55e', padding: '4px 8px', fontSize: '11px', cursor: 'pointer',
                    }}
                  >✓</button>
                )}
                <button
                  onClick={() => setEditing(e => ({ ...e, [genre]: isDiscard ? '' : (mapped ?? '') }))}
                  style={{
                    background: 'none', border: '1px solid var(--border)', borderRadius: '4px',
                    color: 'var(--muted)', padding: '4px 8px', fontSize: '11px', cursor: 'pointer',
                  }}
                >
                  {isMapped ? 'Edit' : '+ Map'}
                </button>
                {!isDiscard && (
                  <button
                    onClick={() => discardGenre(genre)}
                    title="Remove genre tag from all files on next Normalize"
                    style={{
                      background: 'none', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '4px',
                      color: '#ef4444', padding: '4px 6px', fontSize: '11px', cursor: 'pointer', opacity: 0.7,
                    }}
                  >
                    🗑
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
