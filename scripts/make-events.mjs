// Writes EVENTS.md from the event table in js/monster.js.
//
//   node scripts/make-events.mjs      (or: npm run events)
//
// tests/events.test.js fails if EVENTS.md differs from what this would write,
// so the chart in the repo can never quietly fall out of step with the game.

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { eventSchedule, TYPICAL_DAY_XP, STAT_PER_LEVEL } from '../js/monster.js';

export function eventsMarkdown() {
  const rows = eventSchedule().map((e) => {
    const when = e.kind === 'hatch' ? 'day 1' : `day ${e.earliestDay}`;
    const typical = e.kind === 'hatch' ? 'day 1' : `day ${e.typicalDay}`;
    return `| ${e.level} | ${e.label} | ${e.xp} | ${when} | ${typical} |`;
  });

  return `# What happens at each level

Generated from \`js/monster.js\` by \`npm run events\`. **Don't edit this by
hand** — a test fails if it drifts from what the game actually does.

For progress against his real save, open **What happens at each level** at the
bottom of the app. It shows which of these have happened and what's next.

| Level | What happens | Total XP | Earliest | Typical |
| --- | --- | --- | --- | --- |
${rows.join('\n')}

- **Total XP** is the experience needed to reach that level from scratch.
- **Earliest** is every habit logged every day, with 2 or more habits so the
  breadth bonus counts. It is found by playing it out through the game's own
  rules, not calculated separately.
- **Typical** assumes about ${TYPICAL_DAY_XP} XP a day.

**Every** level also raises every stat by ${STAT_PER_LEVEL}, so the levels
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
`;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(new URL('../EVENTS.md', import.meta.url), eventsMarkdown());
  console.log('Wrote EVENTS.md');
}
