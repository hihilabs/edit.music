import { Router } from 'express'
import { parseFile, selectCover } from 'music-metadata'
import NodeID3 from 'node-id3'
import path from 'path'
import { MUSIC_ROOT, RECYCLE_ROOT, safeResolve } from '../lib/roots.js'

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
      title: common.title ?? null,
      artist: common.artist ?? null,
      album: common.album ?? null,
      year: common.year ?? null,
      track: common.track?.no ?? null,
      genre: common.genre?.[0] ?? null,
      duration: format.duration ?? null,
      bitrate: format.bitrate ?? null,
      codec: format.codec ?? null,
      cover: cover ? `data:${cover.format};base64,${cover.data.toString('base64')}` : null,
    })
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})

tagsRouter.patch('/', async (req, res) => {
  try {
    const { path: rel } = req.query as Record<string, string>
    const abs = safeResolve(MUSIC_ROOT, rel)
    const ext = path.extname(abs).toLowerCase()

    if (ext !== '.mp3') {
      res.status(422).json({ error: 'Tag writing currently supported for MP3 only; FLAC support coming next' })
      return
    }

    const { title, artist, album, year, track, genre } = req.body
    const tags: Record<string, string> = {}
    if (title !== undefined) tags.title = title
    if (artist !== undefined) tags.artist = artist
    if (album !== undefined) tags.album = album
    if (year !== undefined) tags.year = String(year)
    if (track !== undefined) tags.trackNumber = String(track)
    if (genre !== undefined) tags.genre = genre

    const success = NodeID3.update(tags, abs)
    if (!success) throw new Error('Tag write failed')
    res.json({ ok: true })
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})
