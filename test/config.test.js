import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, parseEventIds, parseServerUrl } from '../src/config.js';

test('the address: bare host, host:port, URL copied from the browser, sub-path', () => {
  assert.equal(parseServerUrl('192.0.2.10'), 'http://192.0.2.10:3012');
  assert.equal(parseServerUrl('cronicle.lan:8080'), 'http://cronicle.lan:8080');
  assert.equal(parseServerUrl('http://192.0.2.10:3012/#Schedule'), 'http://192.0.2.10:3012');
  assert.equal(
    parseServerUrl('https://example.com/cronicle/api/app/x'),
    'https://example.com/cronicle',
  );
  assert.equal(parseServerUrl('https://user:pw@example.com'), null);
  assert.equal(parseServerUrl('ftp://example.com'), null);
  assert.equal(parseServerUrl(''), null);
});

test('the followed events: ids separated by commas, the rest reported', () => {
  assert.deepEqual(parseEventIds('emvpg2mmu03, emvpg2mns04;emvpg2mmu03 bad/id'), {
    ids: ['emvpg2mmu03', 'emvpg2mns04'],
    invalid: ['bad/id'],
  });
  assert.deepEqual(parseEventIds(undefined), { ids: [], invalid: [] });
});

test('defaults: French, reading only, every event, stuck after an hour', () => {
  const config = normalizeConfig({});
  assert.equal(config.language, 'fr');
  assert.equal(config.allowRun, false);
  assert.deepEqual(config.events, []);
  assert.equal(config.stuckMs, 3600_000);
  assert.equal(config.pollIntervalMs, 60_000);
  assert.equal(normalizeConfig({ allow_run: 'true', stuck_minutes: '0' }).allowRun, true);
  assert.equal(normalizeConfig({ stuck_minutes: '0' }).stuckMs, 0);
  assert.equal(normalizeConfig({ api_key: '  k \n' }).apiKey, 'k');
});

test('the API key pasted in the list of events is dropped, never shown', () => {
  const config = normalizeConfig({ api_key: 'abcdef0123456789', events: 'e1, abcdef0123456789' });
  assert.deepEqual(config.events, ['e1']);
  assert.deepEqual(config.invalidEvents, ['***']);
});
