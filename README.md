# Finance Channel Video Studio

Turns a structured episode script into a finished, upload-ready YouTube video in the
"20 Reasons [Country]'s Economy Defies Expectations" countdown format:

- **Voiceover** from ElevenLabs, with word-level timing
- **Motion graphics** rendered frame by frame: fact numbers, kinetic headlines, count-up stats,
  bar/line/donut charts, a rotating data globe, chapter cards and a subscribe outro
- **Word-synced captions** (the spoken word is highlighted in gold)
- **Loudness-normalised audio** at −14 LUFS (YouTube's target), with an optional ducked music bed
- **YouTube metadata**: title, description, chapter timestamps, sources and tags
- **Thumbnail** at 1280×720

Brand settings (name, colors, voice) live in [`channel.json`](channel.json).

## Quick start

Requirements: Node 22+, ffmpeg, and Playwright with Chromium (`npm i && npx playwright install chromium`).

```bash
export ELEVENLABS_API_KEY=...            # not needed inside Claude cloud sessions

# Fast check: intro + first 3 segments, about 3 minutes to render
node src/render.mjs episodes/south-korea --preview

# Full episode (~16 min of video, roughly 20 min to render on 4 cores)
node src/render.mjs episodes/south-korea --workers 4

# Add background music (any royalty-free track; it loops and ducks under the voice)
node src/render.mjs episodes/south-korea --music assets/music/bed.mp3

# Thumbnail (optionally put a photo on the left side)
node src/thumbnail.mjs episodes/south-korea [--image path/to/photo.jpg]
```

Output goes to `episodes/<slug>/build/`: `<slug>.mp4`, `youtube.txt` and `thumbnail.png`.
Voiceovers are cached in `.cache/tts`, so re-rendering after a visual tweak costs no ElevenLabs credits.
Only segments whose `voiceover` text changed are re-voiced.

Useful flags:

| Flag | Effect |
|---|---|
| `--preview` | First 4 segments only |
| `--only 3,4,5` | Specific segment indexes |
| `--silent` | No ElevenLabs calls (timing is estimated). For testing layouts for free |
| `--workers N` | Segments rendered in parallel (default 3) |
| `--music file` | Background music, ducked under the voice |
| `--metadata` | Rewrite `youtube.txt` only (cached voice, no video render) |

## Making a new episode

1. Copy `episodes/_template/episode.json` to `episodes/<country>/episode.json`.
2. Fill in the segments. The order is `intro`, then `chapter` cards, `fact` 20…1, then `outro`.
   Aim for **100–120 words per fact**: 20 facts ≈ 15–16 minutes.
3. Choose a `module` (on-screen graphic) for each fact:

| type | Use it for | Fields |
|---|---|---|
| `stat` | One headline number | `value`, `prefix`, `suffix`, `decimals`, `label`, `sub` |
| `bars` | Comparing countries or companies | `label`, `items[{label, value, highlight}]`, `prefix`, `suffix`, `decimals` |
| `timeline` | Change over time (`"scale": "log"` for growth stories) | `label`, `points[{x, y}]`, `prefix`, `decimals`, `note` |
| `donut` | A share or percentage | `value` (0–100), `label`, `sub` |
| `versus` | Explaining a system by contrast | `left{label,value,sub}`, `right{...}` |
| `list` | 3–4 named players or reasons | `heading`, `items[]` |

4. Optional `broll`: an image path (relative to the episode folder) that appears behind the fact with a slow zoom.
   Use stock or AI images that match the `visual` direction text.
5. Set `focus` (lat/lon of the country) and `links` (trade partners) for the intro globe.
6. **Fact-check before rendering.** Every fact has a `sources` list. Verify each number against it,
   because finance audiences notice errors and YouTube favours accuracy in this category. The sources are
   printed into the YouTube description automatically.

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
