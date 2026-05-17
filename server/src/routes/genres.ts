import { Router } from 'express'
import fs from 'fs/promises'
import path from 'path'
import { parseFile } from 'music-metadata'
import { File as TagFile } from 'node-taglib-sharp'
import { MUSIC_ROOT } from '../lib/roots.js'

export const genresRouter = Router()

const AUDIO_EXTS    = new Set(['.mp3', '.flac', '.m4a', '.ogg', '.wav', '.aiff', '.aif', '.opus'])
const MAP_PATH      = path.resolve(process.cwd(), 'genre-map.json')
const CACHE_PATH    = path.resolve(process.cwd(), 'genre-scan-cache.json')
const PHRASES_PATH  = path.resolve(process.cwd(), 'genre-phrases.json')

const DEFAULT_PHRASES = ['Drum & Bass']

async function loadPhrases(): Promise<string[]> {
  try { return JSON.parse(await fs.readFile(PHRASES_PATH, 'utf8')) } catch { return [...DEFAULT_PHRASES] }
}

async function savePhrases(phrases: string[]) {
  await fs.writeFile(PHRASES_PATH, JSON.stringify(phrases, null, 2))
}

const DEFAULT_MAP: Record<string, string> = {}

interface FileEntry { genre: string | null; genres: string[]; mtime: number }

interface CacheFile {
  scannedAt: string
  data: { genre: string; count: number }[]
  files?: Record<string, FileEntry>
}

// Per-file genre + mtime — lives in memory, persisted in cache JSON
let fileCache: Record<string, FileEntry> = {}

async function loadScanCache(): Promise<CacheFile | null> {
  try { return JSON.parse(await fs.readFile(CACHE_PATH, 'utf8')) } catch { return null }
}

async function saveScanCache(data: { genre: string; count: number }[]) {
  const payload: CacheFile = { scannedAt: new Date().toISOString(), data, files: fileCache }
  await fs.writeFile(CACHE_PATH, JSON.stringify(payload)).catch(() => {})
}

async function loadMap(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(MAP_PATH, 'utf8'))
  } catch {
    return { ...DEFAULT_MAP }
  }
}

async function saveMap(map: Record<string, string>) {
  await fs.writeFile(MAP_PATH, JSON.stringify(map, null, 2))
}


// Background scan state — polled by the client every second
interface ScanState {
  running: boolean
  progress: { folders: number; artists: number; tracks: number; genres: number; current: string } | null
  result: { genre: string; count: number }[] | null
  scannedAt: string | null
  error: string | null
}
let scanState: ScanState = { running: false, progress: null, result: null, scannedAt: null, error: null }

// Hydrate from disk on startup so a restart doesn't lose the last scan
;(async () => {
  const cached = await loadScanCache()
  if (cached) {
    scanState = { running: false, progress: null, result: cached.data, scannedAt: cached.scannedAt, error: null }
    if (cached.files) fileCache = cached.files
    console.log(`[genres] cache loaded: ${cached.data.length} genres, ${Object.keys(fileCache).length} files (scanned ${cached.scannedAt})`)
  }
})()

async function runScan(incremental = false) {
  if (scanState.running) return

  const useIncremental = incremental && scanState.scannedAt !== null && Object.keys(fileCache).length > 0
  const scannedAtMs = useIncremental ? new Date(scanState.scannedAt!).getTime() : 0
  const prevCache = useIncremental ? { ...fileCache } : {} as Record<string, FileEntry>

  scanState = { running: true, progress: { folders: 0, artists: 0, tracks: 0, genres: 0, current: '' }, result: null, scannedAt: null, error: null }

  const counts = new Map<string, number>()
  const artistSet = new Set<string>()
  const p = scanState.progress!
  const newFileCache: Record<string, FileEntry> = {}

  async function walk(dir: string) {
    let entries
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) {
        p.folders++
        await walk(abs)
      } else {
        const ext = path.extname(e.name).toLowerCase()
        if (!AUDIO_EXTS.has(ext)) continue
        p.tracks++
        // Artist = grandparent of the audio file (works regardless of MUSIC_ROOT depth)
        const albumDir = path.dirname(abs)
        const artistDir = path.dirname(albumDir)
        const rel = path.relative(MUSIC_ROOT, artistDir)
        if (rel && !rel.startsWith('..')) {
          const artist = path.basename(artistDir)
          if (!artistSet.has(artistDir)) { artistSet.add(artistDir); p.artists = artistSet.size; p.current = artist }
        }

        let genre: string | null = null
        try {
          const stat = await fs.stat(abs)
          const mtime = stat.mtimeMs
          if (useIncremental && prevCache[abs] && mtime <= scannedAtMs) {
            // File unchanged — use cached genre, skip parseFile
            const prev = prevCache[abs]
            genre = prev.genre
            // back-fill genres array for old cache entries that predate this field
            newFileCache[abs] = { ...prev, genres: prev.genres ?? (prev.genre ? [prev.genre] : []) }
          } else {
            // New or modified file — read metadata
            const { common } = await parseFile(abs, { skipCovers: true, duration: false })
            const allGenres = common.genre ?? []
            genre = allGenres[0] ?? null
            newFileCache[abs] = { genre, genres: allGenres, mtime }
          }
        } catch {}

        if (genre) { counts.set(genre, (counts.get(genre) ?? 0) + 1); p.genres = counts.size }
      }
    }
  }

  try {
    await walk(MUSIC_ROOT)
    fileCache = newFileCache
    const data = Array.from(counts.entries())
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count)
    const scannedAt = new Date().toISOString()
    await saveScanCache(data)
    scanState = { running: false, progress: null, result: data, scannedAt, error: null }
    if (useIncremental) console.log(`[genres] incremental scan done: ${p.tracks} files walked, ${data.length} genres`)
  } catch (e: any) {
    scanState = { running: false, progress: null, result: null, scannedAt: null, error: e.message }
  }
}

// Start a background scan. Pass { incremental: true } to skip unchanged files.
genresRouter.post('/scan', (req, res) => {
  const incremental = req.body?.incremental === true
  runScan(incremental)
  res.json({ ok: true, already: scanState.running, incremental })
})

// Poll scan progress / result
genresRouter.get('/scan', (_req, res) => {
  res.json(scanState)
})

genresRouter.delete('/cache', (_req, res) => {
  scanState = { running: false, progress: null, result: null, scannedAt: null, error: null }
  res.json({ ok: true })
})

genresRouter.get('/map', async (_req, res) => {
  res.json(await loadMap())
})

// Add or update a single mapping  { variant, canonical }
// canonical = '' means "discard this genre tag when normalizing"
genresRouter.patch('/map', async (req, res) => {
  const { variant, canonical } = req.body
  if (!variant || typeof canonical !== 'string') { res.status(400).json({ error: 'variant and canonical required' }); return }
  const map = await loadMap()
  map[variant.trim().toLowerCase()] = canonical.trim()
  await saveMap(map)
  res.json({ ok: true, map })
})

// Remove a mapping
genresRouter.delete('/map', async (req, res) => {
  const { variant } = req.query as Record<string, string>
  if (!variant) { res.status(400).json({ error: 'variant required' }); return }
  const map = await loadMap()
  delete map[variant.trim().toLowerCase()]
  await saveMap(map)
  res.json({ ok: true, map })
})

// Remove map keys whose variant no longer appears in the current genre scan
genresRouter.post('/map/prune', async (_req, res) => {
  const map = await loadMap()
  const liveKeys = new Set((scanState.result ?? []).map(r => r.genre.toLowerCase()))
  const pruned: string[] = []
  for (const key of Object.keys(map)) {
    if (!liveKeys.has(key)) { pruned.push(key); delete map[key] }
  }
  await saveMap(map)
  res.json({ ok: true, pruned: pruned.length, remaining: Object.keys(map).length, map })
})

// Co-occurrence matrix — which genre tokens share the same files
// Requires a rescan to populate fileCache.genres; old single-genre entries are handled gracefully
genresRouter.get('/cooccurrence', (_req, res) => {
  const tokenCounts = new Map<string, number>()
  const pairCounts  = new Map<string, number>()

  for (const entry of Object.values(fileCache)) {
    const genres = entry.genres?.length ? entry.genres : (entry.genre ? [entry.genre] : [])
    if (!genres.length) continue
    for (const g of genres) tokenCounts.set(g, (tokenCounts.get(g) ?? 0) + 1)
    for (let i = 0; i < genres.length; i++) {
      for (let j = i + 1; j < genres.length; j++) {
        const key = [genres[i], genres[j]].sort().join('\x00')
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
      }
    }
  }

  res.json({
    tokens: Array.from(tokenCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    cooccurrence: Array.from(pairCounts.entries())
      .map(([key, count]) => { const [a, b] = key.split('\x00'); return { a, b, count } })
      .sort((a, b) => b.count - a.count),
  })
})

genresRouter.get('/phrases', async (_req, res) => {
  res.json(await loadPhrases())
})

genresRouter.post('/phrases', async (req, res) => {
  const { phrase } = req.body
  if (!phrase?.trim()) { res.status(400).json({ error: 'phrase required' }); return }
  const phrases = await loadPhrases()
  const trimmed = phrase.trim()
  if (!phrases.includes(trimmed)) { phrases.push(trimmed); await savePhrases(phrases) }
  res.json(phrases)
})

genresRouter.delete('/phrases', async (req, res) => {
  const { phrase } = req.query as Record<string, string>
  if (!phrase) { res.status(400).json({ error: 'phrase required' }); return }
  const phrases = (await loadPhrases()).filter(p => p !== phrase.trim())
  await savePhrases(phrases)
  res.json(phrases)
})

function tokenizeGenre(genre: string, phrases: string[]): string[] {
  // Normalize separators: / , ; | & are treated as word boundaries, then collapse whitespace
  const normalized = genre.replace(/[\/,;|&]+/g, ' ').replace(/\s+/g, ' ').trim()
  const normLow = normalized.toLowerCase()

  const tokens: string[] = []
  let pos = 0
  while (pos < normLow.length) {
    while (pos < normLow.length && normLow[pos] === ' ') pos++
    if (pos >= normLow.length) break
    let matched = false
    for (const phrase of phrases) {
      const pl = phrase.toLowerCase()
      if (normLow.startsWith(pl, pos)) {
        const end = pos + pl.length
        if (end === normLow.length || normLow[end] === ' ') {
          tokens.push(normalized.slice(pos, end))
          pos = end
          matched = true
          break
        }
      }
    }
    if (!matched) {
      const sp = normLow.indexOf(' ', pos)
      if (sp === -1) { tokens.push(normalized.slice(pos)); pos = normLow.length }
      else { tokens.push(normalized.slice(pos, sp)); pos = sp }
    }
  }
  return tokens.filter(t => t.length > 0)
}

interface TokenizeState {
  running: boolean
  dry: boolean
  phase: 'scanning' | 'writing' | null
  scanned: number
  toChange: number
  written: number
  failed: number
  dryResult: { changed: number; total: number; examples: { original: string; tokens: string[] }[] } | null
  done: boolean
  error: string | null
}
const tokInit: TokenizeState = { running: false, dry: true, phase: null, scanned: 0, toChange: 0, written: 0, failed: 0, dryResult: null, done: false, error: null }
let tokenizeState: TokenizeState = { ...tokInit }

genresRouter.get('/tokenize', (_req, res) => {
  res.json(tokenizeState)
})

async function runTokenize(dry: boolean) {
  if (tokenizeState.running) return
  const phrases = (await loadPhrases()).sort((a, b) => b.length - a.length)
  tokenizeState = { running: true, dry, phase: 'scanning', scanned: 0, toChange: 0, written: 0, failed: 0, dryResult: null, done: false, error: null }

  const examples: { original: string; tokens: string[] }[] = []
  const toChange: { abs: string; newGenres: string[] }[] = []

  async function walk(dir: string) {
    let entries
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) { await walk(abs); continue }
      const ext = path.extname(e.name).toLowerCase()
      if (!AUDIO_EXTS.has(ext)) continue
      tokenizeState.scanned++
      try {
        const { common } = await parseFile(abs, { skipCovers: true, duration: false })
        const genres = common.genre ?? []
        if (genres.length === 0) continue
        const allTokens = [...new Set(genres.flatMap(g => tokenizeGenre(g, phrases)))]
        // order-independent set comparison
        const tokSet = new Set(allTokens.map(t => t.toLowerCase()))
        const genSet = new Set(genres.map(t => t.toLowerCase()))
        const same = tokSet.size === genSet.size && [...genSet].every(g => tokSet.has(g))
        if (!same) {
          tokenizeState.toChange++
          if (dry && examples.length < 8) examples.push({ original: genres.join(' / '), tokens: allTokens })
          else if (!dry) toChange.push({ abs, newGenres: allTokens })
        }
      } catch {}
    }
  }

  const written: { abs: string; newGenres: string[] }[] = []

  try {
    await walk(MUSIC_ROOT)

    if (dry) {
      tokenizeState = { ...tokInit, dry: true, scanned: tokenizeState.scanned, toChange: tokenizeState.toChange, dryResult: { changed: tokenizeState.toChange, total: tokenizeState.scanned, examples } }
      return
    }

    tokenizeState.phase = 'writing'
    for (const { abs, newGenres } of toChange) {
      try {
        const file = TagFile.createFromPath(abs)
        file.tag.genres = newGenres
        file.save()
        file.dispose()
        tokenizeState.written++
        written.push({ abs, newGenres })
      } catch (e: any) {
        tokenizeState.failed++
        console.error(`[tokenize] write failed: ${abs} — ${e.message}`)
      }
      await new Promise(resolve => setImmediate(resolve))
    }
    // Update in-memory genre counts only for files that were actually written
    if (scanState.result) {
      const countMap = new Map(scanState.result.map(r => [r.genre, r.count]))
      for (const { abs, newGenres } of written) {
        const oldGenre = fileCache[abs]?.genre
        if (oldGenre) {
          const n = (countMap.get(oldGenre) ?? 1) - 1
          if (n <= 0) countMap.delete(oldGenre); else countMap.set(oldGenre, n)
        }
        for (const g of newGenres) countMap.set(g, (countMap.get(g) ?? 0) + 1)
        if (fileCache[abs]) fileCache[abs] = { ...fileCache[abs], genre: newGenres[0] ?? null, genres: newGenres }
      }
      const data = Array.from(countMap.entries()).map(([genre, count]) => ({ genre, count })).sort((a, b) => b.count - a.count)
      scanState.result = data
      scanState.scannedAt = new Date().toISOString()
      saveScanCache(data)
    } else {
      fs.unlink(CACHE_PATH).catch(() => {})
    }
    tokenizeState = { ...tokInit, dry: false, scanned: tokenizeState.scanned, toChange: toChange.length, written: tokenizeState.written, failed: tokenizeState.failed, done: true }
  } catch (e: any) {
    tokenizeState = { ...tokenizeState, running: false, error: e.message }
  }
}

// Split compound genre strings — always fire-and-forget; poll GET /tokenize for progress + dryResult
genresRouter.post('/tokenize', (req, res) => {
  const dry = req.body?.dry !== false
  if (!tokenizeState.running) {
    tokenizeState = { ...tokInit, dry }
    runTokenize(dry)
  }
  res.json({ ok: true })
})

interface NormalizeState {
  running: boolean
  dry: boolean
  phase: 'scanning' | 'writing' | null
  scanned: number
  toChange: number
  written: number
  dryResult: { changed: number; total: number } | null
  done: boolean
  error: string | null
}
const normInit: NormalizeState = { running: false, dry: true, phase: null, scanned: 0, toChange: 0, written: 0, dryResult: null, done: false, error: null }
let normalizeState: NormalizeState = { ...normInit }

genresRouter.get('/normalize', (_req, res) => {
  res.json(normalizeState)
})

async function runNormalize(dry: boolean) {
  if (normalizeState.running) return
  const map = await loadMap()
  if (Object.keys(map).length === 0) {
    normalizeState = { ...normInit, dry, dryResult: dry ? { changed: 0, total: 0 } : null, done: !dry }
    return
  }

  normalizeState = { running: true, dry, phase: 'scanning', scanned: 0, toChange: 0, written: 0, dryResult: null, done: false, error: null }
  const toChange: { abs: string; canonical: string }[] = []

  async function walk(dir: string) {
    let entries
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) { await walk(abs); continue }
      const ext = path.extname(e.name).toLowerCase()
      if (!AUDIO_EXTS.has(ext)) continue
      normalizeState.scanned++
      try {
        const { common } = await parseFile(abs, { skipCovers: true, duration: false })
        const genre = common.genre?.[0]
        if (!genre) continue
        const canonical = map[genre.trim().toLowerCase()]
        // canonical === '' means discard; treat as a change even though it's empty
        if (canonical !== undefined && canonical !== genre) { toChange.push({ abs, canonical }); normalizeState.toChange++ }
      } catch {}
    }
  }

  try {
    await walk(MUSIC_ROOT)

    if (dry) {
      normalizeState = { ...normInit, dry: true, scanned: normalizeState.scanned, toChange: toChange.length, dryResult: { changed: toChange.length, total: normalizeState.scanned } }
      return
    }

    normalizeState.phase = 'writing'
    for (const { abs, canonical } of toChange) {
      try {
        const file = TagFile.createFromPath(abs)
        file.tag.genres = canonical === '' ? [] : [canonical]
        file.save()
        file.dispose()
        normalizeState.written++
      } catch {}
      await new Promise(resolve => setImmediate(resolve))
    }
    // Update in-memory genre counts and file cache — no rescan needed
    if (scanState.result) {
      const countMap = new Map(scanState.result.map(r => [r.genre, r.count]))
      for (const { abs, canonical } of toChange) {
        const oldGenre = fileCache[abs]?.genre
        if (oldGenre) {
          const n = (countMap.get(oldGenre) ?? 1) - 1
          if (n <= 0) countMap.delete(oldGenre); else countMap.set(oldGenre, n)
        }
        if (canonical !== '') countMap.set(canonical, (countMap.get(canonical) ?? 0) + 1)
        if (fileCache[abs]) {
          const g = canonical === '' ? null : canonical
          fileCache[abs] = { ...fileCache[abs], genre: g, genres: g ? [g] : [] }
        }
      }
      const data = Array.from(countMap.entries()).map(([genre, count]) => ({ genre, count })).sort((a, b) => b.count - a.count)
      scanState.result = data
      scanState.scannedAt = new Date().toISOString()
      saveScanCache(data)
    } else {
      fs.unlink(CACHE_PATH).catch(() => {})
    }
    normalizeState = { ...normInit, dry: false, scanned: normalizeState.scanned, toChange: toChange.length, written: normalizeState.written, done: true }
  } catch (e: any) {
    normalizeState = { ...normalizeState, running: false, error: e.message }
  }
}

// Normalize library — always fire-and-forget; poll GET /normalize for progress + dryResult
genresRouter.post('/normalize', (req, res) => {
  const dry = req.body?.dry !== false
  if (!normalizeState.running) {
    normalizeState = { ...normInit, dry }
    runNormalize(dry)
  }
  res.json({ ok: true })
})
