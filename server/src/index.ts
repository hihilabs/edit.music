import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { filesRouter } from './routes/files.js'
import { tagsRouter } from './routes/tags.js'
import { audioRouter } from './routes/audio.js'
import { searchRouter } from './routes/search.js'
import { lookupRouter } from './routes/lookup.js'
import { healthRouter } from './routes/health.js'
import { genresRouter } from './routes/genres.js'

const app = express()
const PORT = process.env.PORT ?? 3001

app.use(cors({ origin: /^https?:\/\/(localhost|127\.0\.0\.1|tokyo7\.local)(:\d+)?$/ }))
app.use(express.json())

app.use('/api/files', filesRouter)
app.use('/api/tags', tagsRouter)
app.use('/api/audio', audioRouter)
app.use('/api/search', searchRouter)
app.use('/api/lookup', lookupRouter)
app.use('/api/health', healthRouter)
app.use('/api/genres', genresRouter)

// Serve built Vite frontend in production
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.join(__dirname, '..', 'public')
app.use(express.static(publicDir))
app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')))

app.listen(PORT, () => {
  console.log(`edit.music server on :${PORT}`)
  console.log(`  music:   ${process.env.MUSIC_ROOT ?? '/storage/music'}`)
  console.log(`  recycle: ${process.env.RECYCLE_ROOT ?? '/storage/recycle_bin'}`)
})
