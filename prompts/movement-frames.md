# Prompt: movement frames

Send this once per creature, with that creature's current sheet attached
(`assets/embertail.png`, `assets/voltectra.png` or `assets/bubbletide.png`).
Replace `<CREATURE>` with its name. Everything below the line is the prompt.

To order only the blink first, delete the WALK and DANCE sections and change
the two sizes from `512 x 192` to `256 x 192` and `8 columns` to `4 columns`.

---

I need extra animation frames added to an existing pixel art sprite sheet.
It's for a habit-tracking app I built for my 7-year-old son: he logs his
habits and a monster grows up. The monster now wanders around its room and
dances when he pokes it, but it only has one pose to do all of that with, so
I need real frames.

I've attached the current sheet for **<CREATURE>**. It is 192 x 192: three
64 x 64 columns (normal, happy, worn out) across three rows (its hatchling,
adolescent and full grown forms). My code slices this by exact pixel
coordinates, so the layout rules below are strict.

## DELIVERABLE 1: THE EXTENDED SHEET

File: `<creature>.png`
Size: exactly **512 x 192 pixels**
Grid: **8 columns x 3 rows**, each cell exactly **64 x 64**
Background: fully transparent
Scale: 1x. One pixel of art is one pixel in the file.

Rows are unchanged from the attached file:

    Row 0 (y 0-63):    hatchling
    Row 1 (y 64-127):  adolescent
    Row 2 (y 128-191): full grown

Columns:

    Column 0: normal      <- COPY UNCHANGED from the attached sheet
    Column 1: happy       <- COPY UNCHANGED
    Column 2: worn out    <- COPY UNCHANGED
    Column 3: BLINK
    Column 4: WALK 1
    Column 5: WALK 2
    Column 6: DANCE 1
    Column 7: DANCE 2

### Copy the first three columns pixel for pixel

Columns 0, 1 and 2 must be identical to the attached file. Do not redraw,
clean up, resize or improve them. The app switches between these frames many
times a second, and any difference at all shows up as a flicker.

### The alignment rule that matters most

**Every cell keeps its feet on the bottom row of its cell (y 63 within the
cell), centred on x 31-32 — including the walk and dance frames.**

All bouncing, hopping and vertical movement is done in my code. A frame that
lifts the creature off the ground inside its own cell will look like it is
floating, because the code is already moving it up and down underneath.

Nothing may cross a cell border. Keep at least 1 px clear on the left, right
and top of every cell.

### Column 3: BLINK

The normal pose (column 0) with its eyes closed. **Change nothing else** — not
the body, not the limbs, not the tail. This frame is shown for a fraction of
a second every few seconds while it stands still, and any other difference
will read as a twitch rather than a blink.

### Columns 4 and 5: WALK

A two frame walk cycle. The app alternates them as the creature crosses the
room.

    Walk 1: one foot forward and the other back, body at its lowest
    Walk 2: the opposite foot forward, body raised 1-2 px, tail or ears
            trailing behind

Both keep their feet on y 63. Make the difference between the two obvious:
at 64 px a subtle cycle reads as no movement at all.

### Columns 6 and 7: DANCE

Two poses the app alternates a few times a second while the creature dances,
on top of a bounce it adds in code.

    Dance 1: leaning one way, arms or ears thrown up on that side, delighted
    Dance 2: the energy thrown the other way, with a different arm position

**Do not make these mirror images of each other.** Draw both by hand, so it
reads as dancing rather than as a sprite being flipped. Their faces should be
as happy as column 1 or happier — this is the payoff for a child poking the
screen, so it should be worth poking.

## DELIVERABLE 2: LABELED PREVIEW (for checking only)

A separate image of the finished sheet scaled up 4x, with thin grid lines
between cells and the row and column numbers along the edges. Keep the real
PNG clean, with no grid lines or labels.

## STYLE RULES

1. Use only colours already in the attached sheet. No new colours.
2. Hard pixel edges only. No anti-aliasing, no blur, no soft shadows, no
   semi-transparent pixels. Every pixel is fully opaque or fully transparent.
3. Keep the existing 1 px dark outline, in the same outline colour.
4. Light comes from the top left.
5. Each form keeps its own proportions. The hatchling stays round and
   clumsy, the full grown one stays heavy and confident — they should not
   move alike.

## BEFORE YOU SEND IT BACK, CHECK

- [ ] Exactly 512 x 192, cells exactly 64 x 64
- [ ] Columns 0-2 are pixel-identical to the attached file
- [ ] Every cell has its feet on y 63, centred on x 31-32
- [ ] No cell touches its left, right or top border
- [ ] No semi-transparent pixels anywhere, especially on outlines
- [ ] The blink differs from column 0 only in the eyes
- [ ] The two dance poses are not mirror images of each other
