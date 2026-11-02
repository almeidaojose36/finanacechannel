# South Korea — premium footage shot list

Each clip replaces a 3D model or illustrated scene. Data scenes (charts, globes, counters) stay as they are.

## How to deliver each clip
- **Delivery:** push to `assets/footage/` on branch `claude/blissful-ride-gpuc9b` using the exact filename given.
- **Format:** MP4, 16:9, 1080p or higher, at least 5 seconds (8 s is ideal).
- **No on-screen text, logos or brand names.** The video adds its own labels.

## Shared look
Add this text to the end of every prompt so the clips match each other:

> cinematic, photorealistic, shot on ARRI Alexa, 35mm anamorphic, golden-hour or blue-hour light, soft haze, rich contrast, teal-and-amber grade, shallow depth of field, slow smooth camera move, no text, no logos

## Camera motion
Use one slow move per clip: a push-in, a lateral dolly, or an orbit.
- Vehicles move slowly forward.
- Crowds and machines have gentle natural motion.
- No cuts, no fast pans, no morphing.

## Must-have clips
These carry the episode.

| # | File | Where it's used | Prompt (then add the shared look) |
|---|------|------|------|
| 1 | `k9-howitzer.mp4` | Fact 12 | *(already made)* |
| 2 | `fa50-jet.mp4` | Fact 12 | *(already made)* |
| 3 | `k2-tank.mp4` | Fact 12 | Modern South Korean main battle tank driving slowly across a dusty training field, dust trailing behind the tracks, low tracking shot alongside, mountains behind |
| 4 | `lng-carrier.mp4` | Fact 14 | Giant LNG tanker with four spherical gas domes sailing on a calm sea at dusk, slow aerial drone orbit, wake trailing |
| 5 | `busan-port.mp4` | Fact 17 | Aerial drone shot over a vast container port at dusk, gantry cranes loading a huge container ship, stacks of colourful containers, slow push forward |
| 6 | `car-plant.mp4` | Fact 16 | Inside a modern car assembly plant, rows of orange robotic arms welding car bodies, sparks, conveyor moving, slow dolly along the line |
| 7 | `car-carrier.mp4` | Fact 16 | New cars driving up the stern ramp into a huge roll-on/roll-off car-carrier ship at a harbour, evening light, slow wide push-in |
| 8 | `pony-1976.mp4` | Fact 16 | A small boxy 1970s hatchback in pale blue driving on an empty Korean country road at sunset, vintage film tone, side tracking shot |
| 9 | `chip-cleanroom.mp4` | Facts 15 & 1 | Semiconductor cleanroom, technicians in white bunny suits under yellow light, robotic arm moving a silicon wafer, slow dolly |
| 10 | `wafer-macro.mp4` | Fact 15 | Extreme macro of a silicon wafer rotating slowly, rainbow diffraction across thousands of chips, dark background |
| 11 | `hbm-chip.mp4` | Fact 1 | Macro of an AI GPU package: one large central chip flanked by stacks of memory dies on a green substrate, slow orbit, glints of light |
| 12 | `data-center.mp4` | Facts 1 & 2 | Long aisle of a modern AI data center, glowing server racks, blue indicator lights, cool haze, slow push down the aisle |
| 13 | `ev-battery-plant.mp4` | Fact 13 | Battery gigafactory, robots stacking EV battery cells into a pack, clean white hall, slow orbit |
| 14 | `nuclear-plant.mp4` | Fact 2 | Four large domed nuclear reactors beside a desert coastline at sunrise, aerial slow push-in, light haze |
| 15 | `seoul-apartments.mp4` | Facts 10 & 6 | Aerial over dense rows of identical white high-rise apartment towers in Seoul, mountains behind, golden hour, slow lateral drone |
| 16 | `seoul-night.mp4` | Intro & outro | Seoul skyline at night from above the Han River, illuminated bridges, traffic light trails, slow aerial push |

## Nice-to-have clips

| # | File | Where it's used | Prompt (then add the shared look) |
|---|------|------|------|
| 17 | `war-ruins-1950s.mp4` | Fact 20 | 1950s black-and-white archival look, ruined city streets after war, people walking through rubble, slight film flicker, slow pan |
| 18 | `trading-floor-1997.mp4` | Fact 19 | 1990s trading floor in panic, traders with phones, red numbers on CRT screens, handheld feel |
| 19 | `gold-queue.mp4` | Fact 19 | Long orderly line of 1990s Korean citizens in winter coats holding small gold items, outside a bank, overcast |
| 20 | `gold-rings.mp4` | Fact 19 | Close-up of hands dropping gold wedding rings and necklaces into a pile, warm light, slow motion |
| 21 | `gold-melt.mp4` | Fact 19 | Molten gold pouring from a crucible into bar moulds, sparks, slow motion, dark foundry |
| 22 | `kpop-concert.mp4` | Fact 5 | Huge stadium concert crowd with thousands of glowing light sticks, stage lights, wide slow crane shot |
| 23 | `retail-investor.mp4` | Facts 7 & 8 | Young Korean commuter on a subway checking a stock-trading app on a phone, candlestick charts glowing, shallow depth of field |
| 24 | `stock-screens.mp4` | Fact 8 | Wall of stock market screens with moving green and red numbers, reflections, slow lateral dolly |
| 25 | `rd-lab.mp4` | Fact 11 | Engineers in a high-tech lab examining a robot arm and circuit boards, clean blue-white light, slow dolly |
| 26 | `empty-playground.mp4` | Fact 3 | An empty school playground in a Korean city at dusk, swing moving slightly in the wind, apartment towers behind, melancholy |

## Tip for image-to-video
Generate the still first with a text-to-image model, using the prompt plus the shared look. Then animate it with only the camera-motion sentence. That gives the cleanest, most premium result.
