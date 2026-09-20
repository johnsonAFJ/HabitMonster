# Habit Monster spec

**This started as a copy of Micro-Habit Garden**, which lives in `../MicroHabitGarden` and is published at https://johnsonafj.github.io/MicroHabitGarden/. Right now this copy still is that app: the same plants, terrarium and rules. Only the names that would clash have been changed, listed below.

The plan is to replace the plants with a creature that earns experience, levels up and evolves. Everything after "Inherited spec" describes the old garden behavior, which still holds until the rules below are built.

## The monster, as designed so far

Settled with Alex:

- **One monster**, not one per habit. All 3 habits feed the same creature's experience.
- **Up to 3 habits**, same as the garden: yes/no or a number, logged once a day.
- **Two evolutions**, at level 5 and level 15, for 3 forms in total.
- **The sprites** will be described by his son and drawn by Claude Design.

Proposed and waiting on his son. These are my recommendations, not decisions:

| Question | Proposal |
| --- | --- |
| Experience per habit | 10 XP per habit logged, plus a 10 XP bonus for logging all 3 in one day. 40 XP on a full day. |
| Level curve | Level 1 to 2 costs 50 XP, and each level after costs 25 more than the last (50, 75, 100, 125...). At 40 XP a day: level 5 around day 9, level 15 around day 60. |
| Health | 5 points. A day with nothing logged costs 1. A day with anything logged restores 1. At 0 the monster is "worn out" and earns XP at half rate until health recovers. |
| Missed days | Experience and levels are never taken away. The half rate at 0 health is the only penalty. |
| After level 15 | Each habit teaches a named move, written by his son. Badges every 5 levels after that. At level 25, the monster enters a hall of fame and a new egg hatches if he wants one. |
| Art | 3 evolution forms x 3 moods (normal, happy after logging today, worn out at 0 health) = 9 sprites. Animation could come later. |

Open once those are settled: the sprite sheet layout and size, what the background scene becomes now that there's no terrarium, what the screen shows (an XP bar, a health bar, the level), and what the logging animation is in place of the watering can.

Keep the creature original rather than an existing character from a game or show, since the app gets published at a public URL.

## Renamed from the garden

Both apps would be served from `johnsonafj.github.io`, and a browser treats that whole domain as one storage area, so these names had to differ or the two apps would overwrite each other's saves and caches.

| Thing | Garden | Here |
| --- | --- | --- |
| localStorage key | `micro-habit-garden` | `habit-monster` |
| Preview setting key | `micro-habit-garden-show-previews` | `habit-monster-show-previews` |
| Offline cache | `garden-v1` | `monster-v1` |
| Local port | 8437 | 8438 |
| App name | Micro-Habit Garden | Habit Monster |
| Home screen name | Habit Garden | Monster |

The art in `assets/` is still the garden's, icon included.

## Inherited spec

A pixel art terrarium for tracking up to 3 simple daily habits. Each habit is a plant. Keeping the habit waters the plant so it grows. Skipping it makes the plant wilt.

## Running it

```bash
npm start
```

That runs `python3 -m http.server 8438`. Open http://localhost:8438.

Always use that exact address. The browser keeps saved data separately for each address, so opening the app on another port or by double-clicking `index.html` shows an empty garden. Port 8420 was the first choice, but SoccerCoachTracker already uses it.

Tests cover the garden rules and need no dependencies:

```bash
npm test
```

## On your phone

The app is published with GitHub Pages at https://johnsonafj.github.io/MicroHabitGarden/ from the `main` branch of github.com/johnsonAFJ/MicroHabitGarden. To publish a change, commit it and click **Push origin** in GitHub Desktop. Pages updates within a minute or two.

To install it on an iPhone, open the URL in Safari, tap Share, then **Add to Home Screen**. It opens full screen as "Habit Garden" with the pixel art icon.

- **Offline.** `sw.js` caches the app on the phone, so it opens without a signal. It serves the cached copy right away and fetches updates in the background, so after a change is published, the first open shows the old version and the next open shows the new one. Bump `CACHE` in `sw.js` only when its list of files changes. The offline script is skipped on `localhost` so local edits show up on a normal reload.
- **Separate gardens.** `localhost:8438`, the site in Safari, and the home-screen app each keep their own data. To move a garden, export it from one and import it in the other. On an iPhone, do the import inside the home-screen app, not in Safari.
- **Backups on the phone.** In the home-screen app, **Export backup** opens the share sheet, where "Save to Files" keeps a copy. On a computer it downloads the file as usual.
- **Notch and home bar.** The page pads itself with the phone's safe-area insets.
- **New day.** The date is checked every 30 seconds and again whenever the app comes back to the front.

### Icons

`assets/icon.png` is the 32 × 32 master drawn by Claude Design. `npm run icons` scales it into `assets/icons/` at whole-number sizes, padding with the icon's background color:

| File | Use | Art size |
| --- | --- | --- |
| `icon-180.png` | iPhone home screen | 160 px (5×) with a 10 px border |
| `icon-192.png` | Android, install prompts, browser tab | 192 px (6×) |
| `icon-512.png` | Large icon | 512 px (16×) |
| `icon-maskable-512.png` | Launchers that crop icons to a circle | 384 px (12×) with a 64 px border |

## Files

| Path | What it holds |
| --- | --- |
| `js/garden.js` | All rules: dates, health, growth, streaks, adding and deleting habits, backup validation. No DOM, so Node can test it. |
| `js/storage.js` | localStorage save and load, JSON export and import |
| `js/sprites.js` | Loads `assets/*.png` if present, otherwise draws placeholder art in code. Also draws the watering can. |
| `js/main.js` | Page wiring: the canvas scene, habit cards, animation, midnight rollover |
| `manifest.webmanifest` | App name, icons and colors for installing on a phone |
| `sw.js` | Offline support for the published site |
| `scripts/make-icons.mjs` | Builds `assets/icons/` from `assets/icon.png` |
| `sheet.html` | Preview of the sprite sheet and terrarium, for checking new art |
| `tests/garden.test.js` | Tests for `garden.js` |

## Habits

- At most 3.
- Each habit is one of two types:
  - **Yes/no**, like "Did I go for a walk?" One tap logs it.
  - **Number**, like weight, with an optional unit label. Logging any value waters the plant. The app saves the value and shows the most recent one under the plant.
- A day is a local calendar day and rolls over at midnight. If the tab stays open past midnight, it switches to the new day within 30 seconds.
- You can undo today's log. You can't log past days.
- Renaming keeps the plant and its history. Deleting asks for confirmation, then removes the habit, its history and its plant, and puts the species back in the pool.

## Plants

### Species

When you add a habit, the app randomly assigns it one of 4 species: tulip, sunflower, echeveria or cactus. No two habits share a species, and you can't re-roll.

### Health

There are 5 levels:

| Level | Name |
| --- | --- |
| 0 | Thriving |
| 1 | Slight droop |
| 2 | Drooping |
| 3 | Wilted |
| 4 | Fully wilted |

- A new plant starts at 0.
- Each finished day without a log drops it one level, stopping at 4. The plant never dies.
- Each day with a log raises it one level, stopping at 0. From fully wilted, it takes 4 watered days to recover.
- Today only counts once it's logged. An unlogged today doesn't hurt the plant until the day ends.

### Growth

Growth depends on total days watered, not the streak, so a lapse never shrinks a plant. A watering while wilted still counts.

| Stage | Days watered |
| --- | --- |
| Sprout | 0 |
| Young | 7 |
| Mature | 21 |
| Flowering | 45 |

Growth stops at flowering. Health still applies at every stage, so a flowering plant can wilt.

### Shown under each plant

Species and growth stage, health, current streak and total days watered. Number habits also show their last value. The streak counts consecutive logged days ending today, or ending yesterday if today isn't logged yet.

A **Show full-grown plants** button above the terrarium adds a picture of each habit's plant at full bloom and full health to the top-right corner of its card. There's no caption. Hovering the picture shows a label like "Full grown sunflower," and screen readers read the same label. It's drawn at a whole-number scale so the pixels stay square: 48 px for 48 px art, 64 px for the older 32 px art. It's off by default so the plants stay a surprise. The setting is saved per browser under `micro-habit-garden-show-previews` and isn't included in backups.

When you log a habit, a watering can pours over that plant for about a second, then the plant switches to its new sprite.

## Data

The app stores everything under the localStorage key `micro-habit-garden`:

```json
{
  "version": 1,
  "habits": [
    {
      "id": "hmu8ghuquk2br",
      "slot": 0,
      "name": "Weigh in",
      "type": "number",
      "unit": "lbs",
      "species": "sunflower",
      "createdOn": "2026-09-19",
      "logs": { "2026-09-19": 182.4 }
    }
  ],
  "lastBackupAt": "2026-09-19"
}
```

- `slot` (0, 1 or 2) is the planting spot, from left to right. A new habit takes the first free slot.
- `logs` maps each logged date to `true` for yes/no habits, or to the number for number habits. Health, growth and streaks are all calculated from `logs`. None of them are stored.
- **Export backup** downloads this object as a JSON file and records the date. The footer shows how long ago that was, in orange after 14 days or if you've never backed up.
- **Import backup** validates the file and asks before replacing the current garden.
- If the saved data ever fails to parse, the app copies it to a `micro-habit-garden-unreadable-<timestamp>` key before starting fresh, so the history isn't lost.

## Art

The app uses `assets/plants.png` and `assets/terrarium.png` if they exist at a recognized size. Otherwise it draws placeholder art in code with the current layout. Open http://localhost:8438/sheet.html to preview whichever art is in use.

The two files are independent. The app reads the cell size from the sheet's width and the soil line from the terrarium's height, so either one can be upgraded on its own.

| Layout | plants.png | Cell | terrarium.png | Soil line |
| --- | --- | --- | --- | --- |
| Current | 960 × 192 | 48 × 48 | 192 × 96 | y 64 |
| First batch, still supported | 640 × 128 | 32 × 32 | 192 × 144 | y 124 |

### plants.png

- A 20 × 4 grid of 48 × 48 cells, transparent background, 1× scale
- Rows are species, in order: tulip, sunflower, echeveria, cactus
- Column = growth × 5 + health
- Each plant's base sits on the cell's bottom row (y 47), centered on x 23 and 24. No pots or soil.
- A healthy flowering plant is 42 to 45 px tall, so it nearly touches the top of the glass.

### terrarium.png

- 192 × 96 pixels
- Glass top rim at y 10 to 13, open interior from y 14 down to the soil
- Soil surface at y = 64
- Planting spots at x = 48, 96 and 144. The code draws each 48 × 48 plant with its bottom center on the spot, so rows 16 to 63 above each spot must stay clear.

The placeholder plants are drawn on a 32 px grid and centered in 48 px cells, so they don't reach the top of the glass. Real 48 px art does.

### Claude Design brief (48 px version)

Attach the first-batch `plants.png` and `terrarium.png` so Claude Design can match their style, then paste this. When the PNGs come back, check they're exactly 960 × 192 and 192 × 96 with no soft or semi-transparent edges, then replace the files in `assets/`.

```text
I need a second, larger version of the pixel art assets for my habit-tracking web app, Micro-Habit Garden. I've attached the first version (plants.png at 32 x 32 per sprite, and terrarium.png). Keep the same 4 species, the same style, palette feel, outline and lighting. The only changes are a bigger sprite size and a shorter terrarium, so the plants fill the glass. My code slices these images by exact pixel coordinates, so the layout rules below are strict.

DELIVERABLE 1: PLANT SPRITE SHEET

File: plants.png
Size: exactly 960 x 192 pixels
Grid: 20 columns x 4 rows of cells, each cell exactly 48 x 48 pixels
Background: fully transparent
Scale: 1x. One pixel of art equals one pixel in the file. Do not upscale the old sprites. Redraw them at the new size with more detail.

Rows (one species per row, in this order):
  Row 0 (y 0 to 47): Tulip
  Row 1 (y 48 to 95): Sunflower
  Row 2 (y 96 to 143): Echeveria, a rosette succulent
  Row 3 (y 144 to 191): Round barrel cactus

Columns: 4 growth stages, and 5 health levels within each stage.
Column index = growth x 5 + health.

  Growth 0, Sprout (columns 0 to 4): a small seedling, about 10 to 14 px tall
  Growth 1, Young (columns 5 to 9): recognizable as the species, about 20 to 26 px tall
  Growth 2, Mature (columns 10 to 14): full size, no flower, about 32 to 38 px tall
  Growth 3, Flowering (columns 15 to 19): full size with a clear bloom, 42 to 45 px tall. The healthy flowering plant should nearly fill the cell's height.

  The echeveria and cactus are naturally squat. Let them grow wider and rounder, and let the flowering stage add height with a bloom stalk or a flower on top.

  Health 0, Thriving: upright, saturated greens, perky leaves
  Health 1, Slight droop: leaf tips just starting to bend, colors barely duller
  Health 2, Drooping: leaves and stem clearly bending, a bit of yellow creeping in
  Health 3, Wilted: stem leaning hard, leaves hanging, mostly yellow-green with brown edges
  Health 4, Fully wilted: collapsed and brown, but still clearly the same plant and the same growth stage. It is not dead. It must look like it could come back.

For flowering plants, wilting affects the bloom too. Petals droop, fade and brown along the same 5 steps.
For the cactus, wilting means going pale, wrinkling, and leaning instead of drooping leaves.

Alignment rules. These matter most.
  1. Every plant's base sits on the bottom row of its cell (y = 47 within the cell), centered horizontally on x = 23 and 24.
  2. Do NOT draw pots, soil mounds, or ground. Only the plant itself. It will be placed into terrarium soil by code.
  3. Nothing may cross a cell border. Keep at least 1 px of empty space on the left, right, and top of each cell.
  4. The base position must be identical across all 20 cells in a row, so the plant doesn't jump when it changes state.

Style rules:
  1. Hard pixel edges only. No anti-aliasing, no blur, no soft shadows, no semi-transparent pixels. Every pixel is either fully opaque or fully transparent.
  2. One shared palette of 32 colors or fewer across the whole sheet.
  3. A 1 px dark outline around each plant, the same outline color everywhere.
  4. Light comes from the top left.
  5. Match the look of the attached 32 px sheet, with the extra room used for fuller leaves, bigger blooms, and droops that are easier to read.

DELIVERABLE 2: TERRARIUM BACKGROUND

File: terrarium.png
Size: exactly 192 x 96 pixels, 1x scale, same palette and style as the plants and the attached terrarium.
Content: the same glass terrarium, but shorter, so a full-grown plant nearly touches the top of the glass.

Exact layout, top to bottom:
  y 0 to 9: plain soft background above the terrarium
  y 10 to 13: the glass top rim
  y 14 to 63: open glass interior
  y 64: soil surface
  y 64 to about 85: soil, with pebbles in the lower part
  about y 86 to 95: the base or shelf the terrarium sits on
The glass side walls should sit at about x 10 and x 181.

Planting spots. My code will place a 48 x 48 plant sprite so that its bottom center lands on each of these points:
  Spot A: x = 48, y = 64
  Spot B: x = 96, y = 64
  Spot C: x = 144, y = 64

So the soil surface must be at exactly y = 64 across those three spots. The area from y = 16 to y = 63 above each spot must be open glass interior, with nothing covering it. Do not draw any plants in the terrarium.

DELIVERABLE 3: LABELED PREVIEW (for checking only)

A separate image of the plant sheet scaled up 3x, with thin grid lines between cells and the row and column numbers written along the edges. Keep plants.png itself clean, with no grid lines or labels.

Please export plants.png and terrarium.png as PNG files at exactly the sizes listed above.
```

## Not in version 1

- A chart of past values for number habits, like weight over time. The app already saves every value with its date, so the chart only needs a view.
- More than 3 habits, accounts, sync, or reminders.
