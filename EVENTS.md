# What happens at each level

Generated from `js/monster.js` by `npm run events`. **Don't edit this by
hand** — a test fails if it drifts from what the game actually does.

For progress against his real save, open **What happens at each level** at the
bottom of the app. It shows which of these have happened and what's next.

| Level | What happens | Total XP | Earliest | Typical |
| --- | --- | --- | --- | --- |
| 1 | The egg hatches, on the first habit logged | 0 | day 1 | day 1 |
| 3 | A picture for the wall | 78 | day 3 | day 3 |
| 5 | Evolves into its adolescent form | 188 | day 6 | day 7 |
| 5 | Stats appear, and each habit is asked what it trains | 188 | day 6 | day 7 |
| 5 | Breadth bonus: +5 XP a day for logging 2 or more habits | 188 | day 6 | day 7 |
| 6 | A shelf of books | 255 | day 8 | day 10 |
| 9 | A floor lamp | 504 | day 14 | day 18 |
| 12 | A toy chest | 825 | day 22 | day 30 |
| 15 | Evolves into its full grown form | 1218 | day 32 | day 44 |
| 18 | A wall clock | 1683 | day 43 | day 61 |
| 21 | A big leafy plant | 2220 | day 57 | day 80 |
| 24 | A trophy, on the toy chest | 2829 | day 72 | day 102 |

- **Total XP** is the experience needed to reach that level from scratch.
- **Earliest** is every habit logged every day, with 2 or more habits so the
  breadth bonus counts. It is found by playing it out through the game's own
  rules, not calculated separately.
- **Typical** assumes about 28 XP a day.

**Every** level also raises every stat by 1, so the levels
between the ones listed here are not empty.

## If something didn't happen

An event happens the moment its level is reached. If the level on screen is
**at or past** an event's level and it isn't there, that's a bug.

- **Undoing a log** takes its experience back, so it can drop a level and take
  that level's event with it. Log it again and it returns.
- **Missing a day** never costs experience, only health. It just means the next
  event comes later.

## Planned, not built yet

None of these happen at any level yet.

- **The backpack** — swapping between all three monsters, once one is full grown.
- **Held items** — a hat or scarf worn on the monster itself.
- **A hatch sound** — hatching currently borrows the first evolution fanfare.
