# Finance Channel Video Studio

Turns a structured episode script into a finished, upload-ready YouTube video in the
"20 Reasons [Country]'s Economy Defies Expectations" countdown format, styled as a 3D motion film:

- **Voiceover** from ElevenLabs, with word-level timing
- **3D motion graphics** (Three.js, rendered frame by frame): a dot-matrix globe with trade arcs, a 3D terrain
  map of the country, extruded bar towers and bar races, a camera that rides 3D line charts, particle flows,
  bullion stacks, exploded models (chips, ships, cars, tanks, reactors), population pyramids, glass cards
  in depth, a night skyline. Every fact is split into **3–5 beats** that cut on specific narration phrases,
  so the picture changes every 8–12 seconds and the camera never stops moving
- **Whip-pan transitions** with motion blur, bloom, film grain, vignette and drifting particles
- **Sound design**: a generated documentary music bed (pads, sub-bass pulse, arpeggio), whooshes on cuts,
  data ticks on count-ups, sub-bass rumbles on camera moves, risers and impacts on titles and chapters,
  all ducked under the voice and normalised to −14 LUFS. Everything is synthesised, so nothing needs licensing
- **Word-synced captions**, **YouTube metadata** (chapters, sources, tags) and a **thumbnail**

Brand settings (name, colors, voice, render resolution) live in [`channel.json`](channel.json).

## Quick start

Requirements: Node 22+, Python 3 with numpy, ffmpeg, and Playwright with Chromium (`npm i && npx playwright install chromium`).

```bash
export ELEVENLABS_API_KEY=...            # not needed inside Claude cloud sessions

# Check a few frames of specific segments in seconds (PNG stills at 20%/60% of each segment)
node src/render.mjs episodes/south-korea --only 0,3 --stills 0.2,0.6

# Preview: intro + chapter 1 + facts 20 and 19
node src/render.mjs episodes/south-korea --preview

# Full episode (~16 min of video). Without a GPU this takes ~2 hours on 4 cores; with a GPU, minutes.
node src/render.mjs episodes/south-korea

# Thumbnail (optionally put a photo on the left side)
node src/thumbnail.mjs episodes/south-korea [--image path/to/photo.jpg]
```

Output goes to `episodes/<slug>/build/`: `<slug>.mp4`, `youtube.txt` and `thumbnail.png`.
Voiceovers are cached in `.cache/tts`, so re-rendering after a visual tweak costs no ElevenLabs credits.

| Flag | Effect |
|---|---|
| `--preview` | First 4 segments only |
| `--only 3,4,5` | Specific segment indexes |
| `--stills 0.2,0.6` | PNG stills at those fractions (or seconds, if > 1) of each segment, no video |
| `--silent` | No ElevenLabs calls (timing is estimated). For testing layouts for free |
| `--workers N` | Segments rendered in parallel, one browser each (default 3) |
| `--music file` | Use your own music track instead of the generated bed |
| `--no-music` | Voice and sound effects only |
| `--metadata` | Rewrite `youtube.txt` only (cached voice, no video render) |
| `--flat` | The original 2D slide style |

`channel.json → video.renderScale` sets the 3D layer's internal resolution (0.75 = 1440×810, upscaled;
text and captions are always drawn at full 1080p). Use 1 on a machine with a GPU.

## Making a new episode

1. Copy `episodes/_template/episode.json` to `episodes/<country>/episode.json`.
2. Fill in the segments: `intro`, `chapter` cards, `fact` 20…1, `outro`. Aim for **100–120 words per fact**.
3. Give each fact a `beats` list. The first beat starts with the fact; each later beat starts when the
   narrator says its `at` phrase (copied word for word from the voiceover):

```json
"beats": [
  { "scene": "plunge", "heading": "Asian Financial Crisis", "points": [...] },
  { "at": "Around three and a half million", "scene": "flow", "value": 3.5, "suffix": "M", "label": "citizens queued to give their gold" },
  { "at": "Roughly two hundred and twenty-seven tonnes", "scene": "stack", "value": 227, "suffix": " t", "stamp": "IMF REPAID · 2001", "stampAt": "Korea paid back" }
]
```

| scene | Use it for | Key fields |
|---|---|---|
| `globe` | Trade routes, investment flows, "where in the world" | `focus`, `look`, `spin`, `dist`, `arcs[{to,label,sub}]`, `pins[{at,label}]`, `highlight` |
| `terrain` | The country itself, cities, industrial clusters | `focus`, `markers[{at,label,sub,color}]`, `badges[]`, `highlight` |
| `towers` | Comparisons; `"race": true` animates from `from` values and re-ranks | `label`, `items[{label,value,from,highlight}]`, `prefix`, `suffix`, `decimals` |
| `ride` | Change over time; the camera chases the line | `label`, `points[{x,y}]`, `scale: "log"`, `threshold{value,label,color}` |
| `plunge` | A crash: line plus fracturing towers | `points`, `labels[]`, `crackAt` |
| `stat` | One headline number in 3D space | `value`, `prefix`, `suffix`, `label`, `sub`, `object` (a model name) |
| `flow` | Millions of people or units converging | `value`, `suffix`, `label`, `targetLabel`, `target` |
| `stack` | Gold or reserves piling up | `value`, `suffix`, `label`, `stamp`, `stampAt` |
| `network` | Conglomerates, ecosystems | `hubs[]` |
| `orbit` | One company doing many things | `center`, `items[{model,label,at}]` |
| `pie` | A share of the whole | `value`, `wedgeLabel`, `restLabel` |
| `model` | Hero object; `explode` for chips | `model`, `labels[{text,pos,at}]`, `cam{}`, `options` |
| `pyramid` | Demographics over time | `bands[]`, `years[{year,v[]}]` |
| `cards` | Lists of reasons or steps | `items[{title,text,at}]` |
| `jeonse`, `plant`, `skyline`, `flythrough` | Explainer, factory-to-port, city, montage | see `episodes/south-korea` |

Models: `crane`, `wafer`, `ship` (`kind: lng`, `cutaway`), `roro`, `car`, `robotArm`, `chip`, `tower`,
`phone`, `shield`, `hospital`, `reactor`, `tank`, `battery`, `fab`, `vault`, `arrow`.

4. Every beat can have a `kicker` and `heading` (top-left text). The fact's `onscreen` line appears as
   a lower third during beat 2.
5. **Fact-check before rendering.** Every fact has a `sources` list; they print into the YouTube description.

### Prompt for drafting a new script with an AI assistant

> Write `episodes/<country>/episode.json` for "20 Reasons <Country>'s Economy Defies Expectations",
> following `episodes/south-korea/episode.json` exactly: intro, 4 chapters of 5 facts counting down
> 20→1, outro. Voiceover 100–120 words per fact, conversational and fast-paced, each fact opening with
> "Fact N." and a hook. Lead with surprising, finance-focused facts (trade, markets, banking, currency,
> companies, household money), ending on the most powerful one. Use only figures you can attribute to a
> named public source, round them, list those sources per fact, and choose a fitting graphic module.

## Channel strategy

See [`docs/channel-playbook.md`](docs/channel-playbook.md) for content pillars, the episode pipeline
and upload checklists.
