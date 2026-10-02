import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// The footer's build number has to match the cache the service worker uses,
// or a report from his phone would point at the wrong push.
test('the build shown in the footer matches the service worker', () => {
  const cache = read('../sw.js').match(/const CACHE = '([^']+)'/)[1];
  const build = read('../js/main.js').match(/const BUILD = '([^']+)'/)[1];
  assert.equal(build, cache, 'bump BUILD in js/main.js along with CACHE in sw.js');
});

// Every file the page loads has to be in the offline cache, or the app breaks
// offline the first time that file is needed.
test('every script the page loads is cached for offline', () => {
  const sw = read('../sw.js');
  const scripts = new Set();
  for (const file of ['../js/main.js', '../js/arena.js', '../js/art.js', '../js/storage.js', '../js/sound.js', '../js/game.js']) {
    for (const [, name] of read(file).matchAll(/from '\.\/([a-z]+\.js)'/g)) scripts.add(name);
  }
  scripts.add('main.js');
  for (const name of scripts) assert.ok(sw.includes(`'./js/${name}'`), `js/${name} is missing from the offline cache`);
});
