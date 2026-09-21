# Habit Monster spec

A pixel art habit tracker for up to 3 simple daily habits. Logging habits
feeds one creature that earns experience, levels up and evolves twice.

This started as a copy of Micro-Habit Garden, which lives in
`../MicroHabitGarden` and is published at
https://johnsonafj.github.io/MicroHabitGarden/. The habit logging, dates,
backups and phone support are inherited from it. The plants, terrarium and
per-plant health are being replaced by the monster rules below.

**Build status.** `js/monster.js` and its tests implement the rules below.
The page itself (`index.html`, `js/main.js`, `js/sprites.js`) is still the
garden and still uses `js/garden.js`. The swap happens when the art arrives.

## The monster

- **One active monster**, fed by all habits. Not one per habit.
- **Three starters**, described by Alex's son: Embertail (fire), Voltectra
  (electric) and Bubbletide (water). He picks one when the app first opens.
- **Three forms each**, at levels 1, 5 and 15. Cute, then capable, then
  formidable. Each creature keeps one name across all three forms.
- The other two starters unlock at level 15. Swapping between them is
  deferred, but the save file is already shaped for it.

### Hatching

He picks a starter immediately — that choice is the hook, not a reward. It
stays an egg until the first habit is logged, then hatches into what he picked.

## Experience

XP is **derived** by replaying `logs`, the same way the garden derives health
and growth. Nothing accumulated is stored, so the number can never drift from
the history and there is no clock to cheat.

XP is **normalized**: a perfect day is always 40 XP whether he tracks one
habit or three. Otherwise habit count would silently swing leveling speed by
4x, and adding a junk habit would be the fastest way to level.

Each day is worth:

| Part | XP | When |
| --- | --- | --- |
| Base | up to 30 | `30 x logged / scheduled`, rounded |
| Health bonus | 5 | Health was full entering the day |
| Breadth bonus | 5 | 2+ habits exist, 2+ logged, and level 5 or higher |
| **Cap** | **40** | A day can never be worth more |

The breadth bonus is deliberately a **bonus, not a gate**. Requiring a second
habit after the first evolution would mean telling a 7-year-old his monster
has stopped growing until he takes on more work. This offers him a deal
instead.

Today counts as it is earned, so the XP bar moves the moment he logs.

### Levels

Level 1 to 2 costs 35 XP. Each level after costs 8 more: 35, 43, 51, 59...
Cumulative cost grows quadratically, so each level takes longer without ever
hitting a wall. A geometric curve was rejected — at 1.25x per level, level 25
needs 42,000 XP, about three years of perfect logging.

Evolutions land at level 5 and level 15.

| | Level 5 | Level 15 | Level 25 |
| --- | --- | --- | --- |
| Logging everything, 40/day | day 5 | day 31 | day 77 |
| Realistic, 28/day | **day 7** | **day 44** | day 109 |
| Spotty, 18/day | day 11 | day 68 | day 170 |

Tuned for a 7-year-old: the first evolution has to arrive before he loses
interest, and the second has to be a real commitment without being a season.

### Levels are never taken away

Two protections, because the spec promises it and both edge cases are real:

- **Deleting a habit** moves it to a `retired` list instead of dropping its
  logs. XP replay reads live and retired habits together, so deleting never
  lowers the level and never rewrites a past breadth bonus.
- **`levelFloor`** is stored on the monster: the highest level ever reached.
  Display never goes below it. Retuning the curve later can only ever be good
  news.

## Health

One shared 5-point pool, not per-habit. It starts full.

- A finished day with nothing logged costs 1 point, stopping at 0.
- A day with anything logged restores 1 point, stopping at 5.
- At 0 the monster looks **worn out**. That is all it does.

There is deliberately **no XP penalty** for low health. Halving XP at 0 would
punish exactly the person who already fell off and is trying to come back —
the moment the app most needs to be encouraging. The full-health bonus applies
the same pressure with the opposite emotional sign.

## Stats

Four stats: **Strength**, **Speed**, **Wisdom**, **Charisma**. Each habit
trains exactly one, picked from that list when the habit is created. Logging
the habit raises its stat by 1. Stats only ever go up.

Read books to Wisdom, go for a walk to Speed, brush teeth to Charisma.

Stats are purely descriptive for now — a visible record that each habit did
something. Making them mechanical is a much better problem to have at level 20
than a system to build at level 1.

Habits created before level 5 are asked for their stat at the first evolution
instead, since assigning Wisdom on day one, before stats appear anywhere on
screen, is a confusing extra step.

A fifth stat (Heart, or Courage) can be appended later. Growing the list is
safe; removing one is not, since saved habits could already point at it.

## The room

A cozy 256 x 160 pixel house replaces the terrarium. The monster is drawn as a
64 x 64 sprite with its bottom center at x 128, y 128.

It starts sparse but not empty — a floor, a window, one or two touches — and
fills with earned furniture **every third level starting at level 3**. Level
15 gives an evolution instead, so those never double up: items land at levels
3, 6, 9, 12, 18, 21 and 24. That is 7 by level 25 — enough that the room
visibly transforms, few enough that each one is an event.

## The screen

Room on top, one status strip beneath it, habit cards below that.

The strip shows the monster's name, its level, health as 5 pips, and an XP bar
that runs **red when empty and green as it fills**, labelled with progress
**within the current level** — `80 / 139`, not a running total. Concrete
numbers matter: a 7-year-old can read *59 more* and decide to go do the thing.

## Habits

- At most 3. Each is yes/no or a number with an optional unit label.
- Each has one stat.
- A day is a local calendar day, rolling over at midnight. An open tab
  switches within 30 seconds.
- Today's log can be undone. Past days cannot be logged.
- Renaming keeps the history. Deleting asks for confirmation, then retires the
  habit: the card disappears but its XP and stat contributions remain.

## Data

Stored under the localStorage key `habit-monster`:

```json
{
  "version": 2,
  "monsters": [
    {
      "id": "m1a2b3c4",
      "species": "embertail",
      "chosenOn": "2026-09-20",
      "levelFloor": 1
    }
  ],
  "activeMonster": "m1a2b3c4",
  "habits": [
    {
      "id": "hmu8ghuquk2br",
      "slot": 0,
      "name": "Read a book",
      "type": "check",
      "unit": "",
      "stat": "wisdom",
      "createdOn": "2026-09-20",
      "logs": { "2026-09-20": true }
    }
  ],
  "retired": [],
  "lastBackupAt": null
}
```

- `monsters` is an array holding exactly one entry today. The backpack becomes
  additive later — no migration, no risk to his history.
- `slot` (0, 1 or 2) orders the habit cards.
- `logs` maps a logged date to `true`, or to the number for number habits.
  XP, level, health and stats are all derived from `logs`. None are stored.
- `retired` holds deleted habits, keeping `id`, `name`, `stat`, `createdOn`
  and `logs` so XP replay stays correct.
- `levelFloor` is the one intentionally stored derived value.

Backups export this object. Import validates it first. A v1 garden backup is
rejected with a clear message rather than silently half-loading.

If saved data ever fails to parse, the app copies it to
`habit-monster-unreadable-<timestamp>` before starting fresh.

## Renamed from the garden

Both apps are served from `johnsonafj.github.io`, and a browser treats that
whole domain as one storage area, so these had to differ or the two apps would
overwrite each other's saves and caches.

| Thing | Garden | Here |
| --- | --- | --- |
| localStorage key | `micro-habit-garden` | `habit-monster` |
| Preview setting key | `micro-habit-garden-show-previews` | `habit-monster-show-previews` |
| Offline cache | `garden-v1` | `monster-v1` |
| Local port | 8437 | 8438 |
| App name | Micro-Habit Garden | Habit Monster |
| Home screen name | Habit Garden | Monster |

## Art

`ART_BRIEF.md` holds the full Claude Design brief. Summary:

| File | Size | Layout |
| --- | --- | --- |
| `embertail.png` etc. | 192 x 192 | 3 cols (mood) x 3 rows (form), 64 px cells |
| `room.png` | 256 x 160 | Floor line at y 128, clear box at x 96-159, y 64-127 |
| `icon.png` | 32 x 32 | A monster egg, scaled by `npm run icons` |

Moods are normal, happy (logged today) and worn out (health 0). Feet sit on
y 63 of each cell, centered on x 31-32, identical across each row.

The art in `assets/` is still the garden's, icon included.

## Running it

```bash
npm start
```

That runs `node scripts/serve.mjs`, a dependency-free static server. Open
http://localhost:8438. It replaced `python3 -m http.server`, which needs a
readable working directory and so cannot start under a sandboxed launcher.

Always use that exact address. The browser keeps saved data separately for
each address, so opening the app on another port or by double-clicking
`index.html` shows an empty save. Port 8420 was the first choice, but
SoccerCoachTracker already uses it.

Tests need no dependencies:

```bash
npm test
```

## On your phone

The repo is github.com/johnsonAFJ/HabitMonster. GitHub Pages is not enabled
yet; once it is, the app publishes from `main` to
https://johnsonafj.github.io/HabitMonster/ within a minute or two of a push.

To install it on an iPhone, open the URL in Safari, tap Share, then
**Add to Home Screen**.

- **Offline.** `sw.js` caches the app, so it opens without a signal. It serves
  the cached copy first and fetches updates in the background, so after a
  change is published the first open shows the old version and the next shows
  the new one. Bump `CACHE` in `sw.js` only when its file list changes. The
  offline script is skipped on `localhost` so local edits show up on reload.
- **Separate saves.** `localhost:8438`, the site in Safari and the home-screen
  app each keep their own data. Export from one and import in the other to
  move it. On an iPhone, import inside the home-screen app, not in Safari.
- **Backups on the phone.** In the home-screen app, **Export backup** opens
  the share sheet, where "Save to Files" keeps a copy. On a computer it
  downloads as usual.
- **Notch and home bar.** The page pads itself with the safe-area insets.
- **New day.** The date is checked every 30 seconds and whenever the app comes
  back to the front.

### Icons

`assets/icon.png` is the 32 x 32 master. `npm run icons` scales it into
`assets/icons/` at whole-number sizes, padding with the icon's background
color:

| File | Use | Art size |
| --- | --- | --- |
| `icon-180.png` | iPhone home screen | 160 px (5x) with a 10 px border |
| `icon-192.png` | Android, install prompts, browser tab | 192 px (6x) |
| `icon-512.png` | Large icon | 512 px (16x) |
| `icon-maskable-512.png` | Launchers that crop to a circle | 384 px (12x) with a 64 px border |

## Files

| Path | What it holds |
| --- | --- |
| `js/monster.js` | The new rules: dates, XP, levels, health, forms, stats, habit changes. No DOM, so Node can test it. |
| `js/garden.js` | The old plant rules. Still drives the page until the art swap. |
| `js/storage.js` | localStorage save and load, JSON export and import |
| `js/sprites.js` | Loads `assets/*.png` if present, otherwise draws placeholders |
| `js/main.js` | Page wiring: canvas scene, habit cards, animation, midnight rollover |
| `manifest.webmanifest` | App name, icons and colors for installing on a phone |
| `sw.js` | Offline support for the published site |
| `scripts/make-icons.mjs` | Builds `assets/icons/` from `assets/icon.png` |
| `sheet.html` | Sprite sheet preview, for checking new art |
| `chooser.html` | Shows the three hatchlings side by side, so he can pick a starter without seeing the evolved forms. Flags wrong sizes, soft edges and bad baselines. |
| `scripts/serve.mjs` | The local static server behind `npm start` |
| `tests/monster.test.js` | Tests for `monster.js` |
| `tests/garden.test.js` | Tests for `garden.js` |
| `ART_BRIEF.md` | The Claude Design brief |

## Not in version 1

- Swapping between the three monsters. Unlocks at level 15; the save file is
  shaped for it already.
- Held items worn on the sprite — each one multiplies the art across 3 forms
  and 3 moods.
- Stats doing anything mechanical.
- Animation frames.
- A chart of past values for number habits. Every value is already saved with
  its date, so the chart only needs a view.
- More than 3 habits, accounts, sync, or reminders.
