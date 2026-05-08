import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { MUSIC_ROOT, RECYCLE_ROOT, safeResolve } from '../lib/roots.js'

export const audioRouter = Router()

function rootFor(location: string) {
  return location === 'recycle' ? RECYCLE_ROOT : MUSIC_ROOT
}

audioRouter.get('/stream', (req, res) => {
  try {
    const { path: rel, location = 'music' } = req.query as Record<string, string>
    const abs = safeResolve(rootFor(location), rel)
    const stat = fs.statSync(abs)
    const ext = path.extname(abs).toLowerCase()

    const mimeMap: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.flac': 'audio/flac',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.aiff': 'audio/aiff',
      '.aif': 'audio/aiff',
      '.opus': 'audio/ogg; codecs=opus',
    }

    const mime = mimeMap[ext] ?? 'application/octet-stream'
    const range = req.headers.range

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-')
      const start = parseInt(startStr, 10)
      const end = endStr ? parseInt(endStr, 10) : stat.size - 1
      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1,
        'Content-Type': mime,
      })
      fs.createReadStream(abs, { start, end }).pipe(res)
    } else {
      res.writeHead(200, {
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
        'Content-Type': mime,
      })
      fs.createReadStream(abs).pipe(res)
    }
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})
