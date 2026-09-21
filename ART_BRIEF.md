# Claude Design brief — Habit Monster art

Three deliverables: a **monster sprite sheet** (one per creature), a **room
background**, and an **app icon**. Room furniture comes later, once the
endgame items are designed.

The app slices these images by exact pixel coordinates, so every size and
alignment rule below is strict. Anything off by a pixel shows up as a jump
when the monster changes state.

## The creatures

Described by Alex's son. Three starters: he picks one when the app first
opens, and the other two unlock later.

| Creature | Element | Description |
| --- | --- | --- |
| **Embertail** | Fire | A small, bipedal ember-lizard with charcoal-gray scales and a glowing crystal at the end of its tail. Curious, stubborn, and can release short bursts of warm sparks when excited or threatened. |
| **Voltectra** | Electric | A quick, fox-like creature with oversized ears, cream-colored fur, and a pair of coppery whiskers that store static electricity. Darts through tall grass and discharges harmless electric pops to communicate with its friends. |
| **Bubbletide** | Water | A round, river-dwelling turtle creature with a smooth jade shell covered in soft moss. Pulls moisture from the air to form floating water bubbles, using them for play, protection, or to water nearby plants. |

Each keeps its **one name across all three forms**. Embertail is Embertail as a
hatchling and as a full-grown adult. Do not invent evolution names.

Keep these original. The app is published at a public URL, so nothing may
resemble a character from an existing game or show.

---

# DELIVERABLE 1: MONSTER SPRITE SHEET

Order one creature at a time — one file per creature, so each gets full
attention.

File: `embertail.png` (or `voltectra.png`, `bubbletide.png`)
Size: exactly **192 x 192 pixels**
Grid: **3 columns x 3 rows**, each cell exactly **64 x 64 pixels**
Background: fully transparent
Scale: 1x. One pixel of art equals one pixel in the file. Do not upscale a
smaller drawing — draw at this size.

## Rows are evolution forms

    Row 0 (y 0 to 63):    Form 1, hatchling   - player levels 1 to 4
    Row 1 (y 64 to 127):  Form 2, adolescent  - player levels 5 to 14
    Row 2 (y 128 to 191): Form 3, full grown  - player level 15 and up

The creature must stay recognizably itself across all three. Same palette,
same defining features, same silhouette language. A player should see form 3
and know instantly it is the same animal that hatched. The defining feature —
Embertail's tail crystal, Voltectra's whiskers and ears, Bubbletide's mossy
shell — carries through all three and grows more prominent each time.

The arc is **cute to capable to formidable**:

    Form 1: small and round, oversized head, short limbs, about 34 px tall.
            Unmistakably a baby: soft shapes, big eyes, a little clumsy.
            The element feature is present but small and dim.

    Form 2: adolescent. Leggier and more athletic, head closer to proportion,
            about 46 px tall. Posture is alert and confident. Sharper edges
            start appearing — a longer snout, defined claws, a set jaw. The
            element feature is clearly developed and active.

    Form 3: full grown, about 60 px tall, nearly filling the cell. Mature and
            impressive: broader stance, heavier build, visible strength.
            Aggressive in bearing — a harder gaze, horns or spines or bared
            fangs where they suit the animal, battle-ready posture. The
            element feature is the dominant visual note and at full power.

            Keep it heroic rather than horrifying. This belongs to a 7-year-old:
            it should look like it could win a fight, not like it would start
            one with him. Think a proud guardian, not a monster under the bed.

## Columns are moods

    Column 0 (x 0 to 63):    NORMAL
    Column 1 (x 64 to 127):  HAPPY
    Column 2 (x 128 to 191): WORN OUT

    NORMAL   - calm idle. Neutral, alert, at rest.

    HAPPY    - shown the day a habit is logged. Clear, readable joy: eyes
               bright or squeezed shut, mouth open, body lifted, element
               feature flaring. This must read instantly at small size, and it
               is the single most important cell in the sheet — it is the
               reward for doing the thing.

    WORN OUT - shown when nothing has been logged for several days. Droopy,
               dimmed, sitting or slumped, element feature faded to almost
               nothing. Tired, NOT sick, NOT injured, NOT dead. It must look
               like rest and attention would fix it. A child will see this and
               feel bad, which is the point — so make it sympathetic rather
               than grim, and never frightening.

Mood does not change form. Every cell in row 0 shows form 1; the columns only
vary its expression and posture. Even form 3, which is fierce by default,
still gets a genuinely happy cell and a genuinely sad one.

## Alignment rules — these matter most

1. Every creature's feet sit on the **bottom row of its cell** (y = 63 within
   the cell), centered horizontally on **x = 31 and 32**.
2. The base position must be **identical across all 3 cells in a row**, so the
   creature does not shift when its mood changes.
3. Draw no ground, shadow, floor or platform. Only the creature. The app places
   it into the room by code.
4. Nothing may cross a cell border. Keep at least 1 px of empty space on the
   left, right and top of every cell.

## Style rules

1. Hard pixel edges only. No anti-aliasing, no blur, no soft shadows, no
   semi-transparent pixels. Every pixel is fully opaque or fully transparent.
2. One shared palette of 32 colors or fewer across the whole sheet.
3. A 1 px dark outline around the creature, the same outline color everywhere.
4. Light comes from the top left.
5. Warm and characterful. Readable silhouettes matter more than fine detail.

---

# DELIVERABLE 2: ROOM BACKGROUND

File: `room.png`
Size: exactly **256 x 160 pixels**, 1x scale
Background: fully opaque, no transparency

A small, cozy pixel-art room — the monster's home. Warm and inviting,
lived-in but not cluttered. A snug cottage interior at golden hour.

Exact layout, top to bottom:

    y 0 to 15:    ceiling line or upper wall trim
    y 16 to 127:  wall. A window on the LEFT (roughly x 16 to 72) showing warm
                  daylight outside. Keep the right half of the wall relatively
                  plain — earned furniture gets added there later.
    y 128:        floor line. This exact row is where the monster stands.
    y 129 to 159: floor in simple perspective, with floorboards or a small rug.

**Keep clear:** the monster is drawn as a 64 x 64 sprite with its bottom center
at **x = 128, y = 128**. The rectangle from **x 96 to 159, y 64 to 127** must be
open wall and floor with nothing drawn over it — no furniture, no decoration,
no window inside that box.

The room should read as sparse but not empty: a floor, a window, one or two
small touches. It fills up over time as the player earns furniture, so leave
obvious room to grow along the right wall and the floor edges.

Same palette family, outline treatment and lighting as the creature sheets, so
any of the three creatures looks at home in it.

---

# DELIVERABLE 3: APP ICON

File: `icon.png`
Size: exactly **32 x 32 pixels**, 1x scale
Background: fully opaque — a flat color or simple gradient that still reads
when cropped to a circle.

A **monster egg**: speckled, warm, sitting slightly off-center with a soft
highlight. Not any one of the three creatures, since the player chooses which
one hatches.

A script scales this to 180, 192 and 512 px, so it must be legible at 32 px:
bold shapes, high contrast, no fine detail, nothing important within 3 px of
any edge.

---

# DELIVERABLE 4: LABELED PREVIEW (for checking only)

A separate image of each sprite sheet scaled up 4x, with thin grid lines
between cells and row and column numbers along the edges. Keep the real PNGs
clean — no grid lines or labels in the files the app uses.

---

# Checklist before accepting the files

- [ ] Sprite sheet exactly 192 x 192, cells exactly 64 x 64, 3 x 3
- [ ] Feet on y 63 of each cell, centered x 31-32, identical across each row
- [ ] All three forms read as the same animal, with the same name
- [ ] Form 3 is aggressive but still friendly to a child
- [ ] The HAPPY cell reads as joyful at a glance, in all three forms
- [ ] The WORN OUT cell reads as tired, not sick or dead
- [ ] No semi-transparent pixels anywhere — check the outline especially
- [ ] `room.png` exactly 256 x 160, floor line at y 128
- [ ] The box x 96-159, y 64-127 in `room.png` is clear
- [ ] `icon.png` exactly 32 x 32
