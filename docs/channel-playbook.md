# Channel Playbook

## Format

Countdown documentaries of about 15 minutes: "20 Reasons [Place]'s Economy Defies Expectations".
Every fact is a self-contained 40–50 second module with a new number, a new headline and a new graphic,
so viewer curiosity resets often. The video clears YouTube's 8-minute mid-roll threshold with plenty of room.

## Content pillars

| Pillar | Share | Examples |
|---|---|---|
| US states as countries | ~50% | Texas, California, Florida, New York, Alaska. Compare each state's GDP to G20 nations |
| Pacific & global powers | ~30% | South Korea ✅, Japan, Taiwan, China, Australia, Singapore, India |
| Breaking-event finance | ~20% | "15 financial realities behind [launch / IPO / earnings]". Cover the money, not the specs |

Keep every video in the same financial frame (the money, trade, markets and household finance behind the
place or event) so the recommendation algorithm sends the same viewers from one pillar to the next.

## Episode pipeline

1. **Research and script** with `episode.json`: facts, voiceover, graphic module and sources for each.
2. **Fact-check** every number against its listed source.
3. **Silent layout pass**: `node src/render.mjs episodes/<slug> --silent --preview`.
4. **Voiced preview**: `--preview` costs about 2,000 ElevenLabs characters.
5. **Full render** costs about 14,500 characters per 16-minute episode.
6. **Thumbnail**: `node src/thumbnail.mjs episodes/<slug>`, optionally with a strong photo via `--image`.
7. **Upload**: paste `build/youtube.txt` into the title, description and tags fields.

## Upload checklist

- [ ] Every figure checked against its source
- [ ] Title under 70 characters, with the number and the place in it
- [ ] Thumbnail readable at phone size (three to five words of headline)
- [ ] Chapters in the description (generated automatically)
- [ ] Pinned comment asking the viewer's-country question from the outro
- [ ] Not marked "made for kids", so personalised ads stay on
- [ ] Altered/synthetic content disclosure answered (voice is AI-generated: YouTube asks about realistic
      synthetic media; a clearly narrated explainer usually doesn't require the label, but check the current policy)

## Upgrades worth adding later

- Real b-roll (stock footage or licensed photos) via the `broll` field
- A custom or cloned ElevenLabs voice for a signature narrator (set `voice.voiceId` in `channel.json`)
- A royalty-free music bed via `--music`
- Shorts: render one fact at 1080×1920 as a teaser for each episode
