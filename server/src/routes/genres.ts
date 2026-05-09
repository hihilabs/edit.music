import { Router } from 'express'
import fs from 'fs/promises'
import path from 'path'
import { parseFile } from 'music-metadata'
import { File as TagFile } from 'node-taglib-sharp'
import { MUSIC_ROOT } from '../lib/roots.js'

export const genresRouter = Router()

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.m4a', '.ogg', '.wav', '.aiff', '.aif', '.opus'])
const MAP_PATH = path.resolve(process.cwd(), 'genre-map.json')

const DEFAULT_MAP: Record<string, string> = {}

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
  error: string | null
}
let scanState: ScanState = { running: false, progress: null, result: null, error: null }

async function runScan() {
  if (scanState.running) return
  scanState = { running: true, progress: { folders: 0, artists: 0, tracks: 0, genres: 0, current: '' }, result: null, error: null }

  const counts = new Map<string, number>()
  const artistSet = new Set<string>()
  const p = scanState.progress!

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
        try {
          const { common } = await parseFile(abs, { skipCovers: true, duration: false })
          const genre = common.genre?.[0]
          if (genre) { counts.set(genre, (counts.get(genre) ?? 0) + 1); p.genres = counts.size }
        } catch {}
      }
    }
  }

  try {
    await walk(MUSIC_ROOT)
    const data = Array.from(counts.entries())
      .map(([genre, count]) => ({ genre, count }))
      .sort((a, b) => b.count - a.count)
    scanState = { running: false, progress: null, result: data, error: null }
  } catch (e: any) {
    scanState = { running: false, progress: null, result: null, error: e.message }
  }
}

// Start a background scan
genresRouter.post('/scan', (_req, res) => {
  runScan()  // fire and forget
  res.json({ ok: true, already: scanState.running })
})

// Poll scan progress / result
genresRouter.get('/scan', (_req, res) => {
  res.json(scanState)
})

genresRouter.delete('/cache', (_req, res) => {
  scanState = { running: false, progress: null, result: null, error: null }
  res.json({ ok: true })
})

genresRouter.get('/map', async (_req, res) => {
  res.json(await loadMap())
})

// Add or update a single mapping  { variant, canonical }
genresRouter.patch('/map', async (req, res) => {
  const { variant, canonical } = req.body
  if (!variant || !canonical) { res.status(400).json({ error: 'variant and canonical required' }); return }
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

// Normalize library — dry=true for preview, dry=false to apply
genresRouter.post('/normalize', async (req, res) => {
  const dry = req.body?.dry !== false
  const map = await loadMap()
  if (Object.keys(map).length === 0) { res.json({ changed: 0, total: 0, dry }); return }

  let total = 0, changed = 0
  const toChange: { abs: string; canonical: string }[] = []

  async function walk(dir: string) {
    let entries
    try { entries = await fs.readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) { await walk(abs); continue }
      const ext = path.extname(e.name).toLowerCase()
      if (!AUDIO_EXTS.has(ext)) continue
      total++
      try {
        const { common } = await parseFile(abs, { skipCovers: true, duration: false })
        const genre = common.genre?.[0]
        if (!genre) continue
        const canonical = map[genre.trim().toLowerCase()]
        if (canonical && canonical !== genre) toChange.push({ abs, canonical })
      } catch {}
    }
  }

  await walk(MUSIC_ROOT)
  changed = toChange.length

  if (!dry) {
    // Process in batches of 10 to avoid hammering the FS
    for (let i = 0; i < toChange.length; i += 10) {
      await Promise.all(toChange.slice(i, i + 10).map(async ({ abs, canonical }) => {
        try {
          const file = TagFile.createFromPath(abs)
          file.tag.genres = [canonical]
          file.save()
          file.dispose()
        } catch {}
      }))
    }
    scanState.result = null // bust cached result after writes
  }

  res.json({ changed, total, dry })
})
