import { Router } from 'express'
import fs from 'fs/promises'
import path from 'path'
import { MUSIC_ROOT, RECYCLE_ROOT, safeResolve } from '../lib/roots.js'

export const filesRouter = Router()

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.m4a', '.ogg', '.wav', '.aiff', '.aif', '.opus'])

async function readDir(root: string, rel: string) {
  const abs = safeResolve(root, rel)
  const entries = await fs.readdir(abs, { withFileTypes: true })
  return entries
    .filter(e => e.isDirectory() || AUDIO_EXTS.has(path.extname(e.name).toLowerCase()))
    .map(e => ({
      name: e.name,
      type: e.isDirectory() ? 'dir' : 'file',
      ext: e.isFile() ? path.extname(e.name).toLowerCase() : null,
    }))
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

filesRouter.get('/music', async (req, res) => {
  try {
    const rel = (req.query.path as string) ?? '.'
    res.json(await readDir(MUSIC_ROOT, rel))
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})

filesRouter.get('/recycle', async (req, res) => {
  try {
    const rel = (req.query.path as string) ?? '.'
    res.json(await readDir(RECYCLE_ROOT, rel))
  } catch (e: any) {
    res.status(400).json({ error: e.message })
  }
})
