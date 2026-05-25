
---

## Session notes — 2026-05-24

### Vision: fully atomic genre token database

**Core decision: strip all protected phrases. Default = empty.**
Every word is a token. "Drum & Bass" → `drum` + `bass`. "R&B" → `rhythm` + `blues`.
"Hip-Hop" → `hip` + `hop`. "Neurofunk" → `neuro` + `funk`.

Split produces noise only when the word itself is meaningless alone.
That turns out to be almost nothing — trust the corpus.

### The parallelism insight (user)
Rock and Drum & Bass share the same subgenre topology:
- Rock: Classic → Alternative → Indie → Post-Rock → Math Rock → Noise Rock → Shoegaze
- DnB:  Classic → Jump-Up → Liquid → Neurofunk → Dark → Minimal → Techstep

Both have:
  - A "classic" root
  - A "liquid / soft" branch (Liquid DnB ↔ Indie/Dream Pop)
  - A "hard / dark" branch (Neurofunk/Dark ↔ Metal/Doom)
  - A "experimental" tip (Minimal/Techstep ↔ Math Rock/Noise)

This means the atomic token graph will show these cross-genre structural mirrors.
`dark` token bridges both families. `liquid` bridges DnB + Jazz/Soul.
`hard` bridges Metal + Techstep. The token IS the structural position.

### Playlist builder — next feature

**Goal:** query atomic token set → Plex playlist via API.

**Query model:**
  Explore mode (OR, ranked): [drum, funk] → everything sharing those tokens, ranked by overlap
  Strict mode (AND): [drum, funk, liquid] → intersection only, narrows to Liquid DnB zone
  BPM window: bpmMin / bpmMax filter on metadata (REQUIRED — BPM is a first-class filter)

**Examples:**
  [funk, drum] explore          → DnB + Funk crossovers (happy accidents, discovery)
  [funk, drum, liquid] strict   → Liquid Funk DnB only
  [neuro, dark] strict          → Heavy Neuro set
  [house] + BPM 124-128         → House playlist
  [hip, hop] + BPM 85-95        → Classic Hip-Hop

**Implementation pieces:**
  1. `GET /api/playlist/query?tokens=drum,funk&mode=any|all&bpmMin=170&bpmMax=180`
     - reads fileCache (already has per-file genre tokens + metadata)
     - mode=all → AND (strict), mode=any → OR ranked by overlap count
     - returns matching file paths + track metadata
  2. `POST /api/playlist/plex` → creates Plex playlist via XML API
     - needs PLEX_URL + PLEX_TOKEN in .env
     - POST to /playlists with track ratingKeys
  3. UI: chip token builder + mode toggle + BPM range slider + "Create in Plex" button

**Files to create/edit:**
  - server/src/routes/playlist.ts  (new — query + plex bridge)
  - server/src/index.ts            (register /api/playlist router)
  - client/src/components/PlaylistBuilder.tsx  (new)
  - client/src/App.tsx             (add Playlist tab)
  - .env.example                   (add PLEX_URL, PLEX_TOKEN)

**Plex API notes:**
  - List all tracks: GET {PLEX_URL}/library/sections/{MUSIC_SECTION}/all?type=10&X-Plex-Token={TOKEN}
  - Match by file path → ratingKey
  - Create playlist: POST {PLEX_URL}/playlists?type=audio&title=...&uri=...&X-Plex-Token={TOKEN}
  - Plex music section ID is usually 1 or 2 — can discover via GET /library/sections

**Pre-requisite:** strip default protected phrase "Drum & Bass" from server/src/routes/genres.ts line 16
  const DEFAULT_PHRASES = ['Drum & Bass']  →  const DEFAULT_PHRASES = []
  Then rescan + run Split pass to rebuild fully atomic token set.

