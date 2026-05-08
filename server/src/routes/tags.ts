import { Router } from 'express'
import { parseFile } from 'music-metadata'
import type { IPicture } from 'music-metadata'
import { File as TagFile } from 'node-taglib-sharp'
import { MUSIC_ROOT, RECYCLE_ROOT, safeResolve } from '../lib/roots.js'

function selectCover(pictures?: IPicture[]): IPicture | null {
  if (!pictures?.length) return null
  return pictures.find(p => p.name && ['front', 'cover', 'cover (front)'].includes(p.name.toLowerCase())) ?? pictures[0]
}

export const tagsRouter = Router()

function rootFor(location: string) {
  return location === 'recycle' ? RECYCLE_ROOT : MUSIC_ROOT
}

tagsRouter.get('/', async (req, res) => {
  try {
    const { path: rel, location = 'music' } = req.query as Record<string, string>
    const abs = safeResolve(rootFor(location), rel)
    const { common, format } = await parseFile(abs)
    const cover = selectCover(common.picture)
    res.json({
      title:    common.title   ?? null,
      artist:   common.artist  ?? null,
      album:    common.album   ?? null,
      year:     common.year    ?? null,
      track:    common.track?.no ?? null,
      genre:    common.genre?.[0] ?? null,
      duration: format.duration ?? null,
      bitrate:  format.bitrate  ?? null,
      codec:    format.codec    ?? null,
      cover:    cover ? `data:${cover.format};base64,${Buffer.from(cover.data).toString('base64')}` : null,
    })
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})

tagsRouter.patch('/', async (req, res) => {
  try {
    const { path: rel } = req.query as Record<string, string>
    const abs = safeResolve(MUSIC_ROOT, rel)

    const file = TagFile.createFromPath(abs)
    const t = file.tag

    const { title, artist, album, year, track, genre } = req.body
    if (title  !== undefined) t.title       = title  || ''
    if (artist !== undefined) t.performers  = artist ? [artist] : []
    if (album  !== undefined) t.album       = album  || ''
    if (year   !== undefined) t.year        = Number(year) || 0
    if (track  !== undefined) t.track       = Number(track) || 0
    if (genre  !== undefined) t.genres      = genre  ? [genre] : []

    file.save()
    file.dispose()
    res.json({ ok: true })
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})
