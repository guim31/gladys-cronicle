// -----------------------------------------------------------------------------
// Conformity with the Gladys core, on every device discovered from the real
// answers of Cronicle 0.9.80 (test/fixtures/cronicle: three events, jobs that
// succeeded, failed, were aborted, or run now), in every feature-name language.
//
// The table (test/fixtures/gladys-feature-table.json) is extracted from the
// core code: a category/type couple missing there shows as "undefined" or
// without icon in Gladys, a poll frequency outside its list is a 400 on
// discovery, a feature without min/max is a 422 on "Add to Gladys".
// Do not loosen this test to make it pass: fix the integration.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../src/app.js';
import { Store } from '../src/store.js';

process.env.LOG_LEVEL ??= 'silent';

const table = JSON.parse(
  await readFile(new URL('./fixtures/gladys-feature-table.json', import.meta.url), 'utf8'),
);

const fixture = (name) =>
  readFile(new URL(`./fixtures/cronicle/${name}.json`, import.meta.url), 'utf8');
const bodies = {
  get_schedule: await fixture('get_schedule'),
  get_history: await fixture('get_history'),
  get_event_history: await fixture('get_event_history'),
  running: await fixture('get_active_jobs'),
  idle: JSON.stringify({ code: 0, jobs: {} }),
};

/** The recorded answers of Cronicle, by request. */
function recorded(active) {
  return async (url) => {
    const name = new URL(url).pathname.replace('/api/app/', '');
    return { status: 200, body: name === 'get_active_jobs' ? active : bodies[name] };
  };
}

async function discover(language, active) {
  const gladys = createFakeGladys({
    config: {
      url: 'http://192.0.2.10:3012',
      api_key: 'cronicle_test_key_0000000000000001',
      language,
    },
  });
  const app = registerHandlers(gladys, {
    store: new Store(mkdtempSync(join(tmpdir(), 'gladys-cronicle-rules-'))),
    timers: false,
    request: recorded(active),
  });
  await gladys.connect();
  await app.ready;
  // The states, too: added devices, every value checked by the fake Gladys.
  for (const device of gladys.fake.discoveredDevices) {
    await gladys.fake.deviceCreated(device);
  }
  await app.stop();
  return gladys.fake;
}

const scenarios = [
  { label: 'English names, jobs over', language: 'en', active: bodies.idle },
  { label: 'French names, jobs running', language: 'fr', active: bodies.running },
  { label: 'German names, jobs over', language: 'de', active: bodies.idle },
  { label: 'Spanish names, jobs running', language: 'es', active: bodies.running },
];

for (const scenario of scenarios) {
  test(`every discovered device follows the Gladys rules (${scenario.label})`, async () => {
    const fake = await discover(scenario.language, scenario.active);
    const devices = fake.discoveredDevices;
    assert.equal(devices.length, 4, 'the server and the three events of the fixture');
    assert.ok(fake.states.length >= 15, 'states accepted by the fake Gladys');
    assert.equal(
      new Set(devices.map((device) => device.external_id)).size,
      devices.length,
      'unique device external ids',
    );

    for (const device of devices) {
      const where = device.name;

      // should_poll: true if and only if poll_frequency is provided, in ms.
      if (device.poll_frequency === undefined) {
        assert.notEqual(device.should_poll, true, `${where}: should_poll without poll_frequency`);
      } else {
        assert.equal(device.should_poll, true, `${where}: poll_frequency without should_poll`);
        assert.ok(
          table.poll_frequencies_ms.includes(device.poll_frequency),
          `${where}: poll_frequency ${device.poll_frequency} is not one of ${table.poll_frequencies_ms}`,
        );
      }

      assert.ok(device.features.length > 0, `${where}: no feature`);
      const externalIds = new Set();
      const names = new Set();
      for (const feature of device.features) {
        const at = `${where} / ${feature.name}`;
        const pair = table.pairs[`${feature.category}/${feature.type}`];
        assert.ok(pair, `${at}: ${feature.category}/${feature.type} is not a couple Gladys knows`);
        assert.ok(
          pair.label_en && pair.label_fr && pair.icon,
          `${at}: couple without label or icon`,
        );

        assert.equal(typeof feature.min, 'number', `${at}: min must be a number`);
        assert.equal(typeof feature.max, 'number', `${at}: max must be a number`);
        assert.ok(
          Number.isFinite(feature.min) && Number.isFinite(feature.max),
          `${at}: finite min/max`,
        );
        assert.ok(feature.min <= feature.max, `${at}: min > max`);
        assert.equal(typeof feature.read_only, 'boolean', `${at}: read_only must be a boolean`);
        assert.equal(
          typeof feature.has_feedback,
          'boolean',
          `${at}: has_feedback must be a boolean`,
        );
        if (feature.unit !== undefined) {
          assert.ok(table.units.includes(feature.unit), `${at}: unknown unit ${feature.unit}`);
        }

        assert.ok(!externalIds.has(feature.external_id), `${at}: duplicate external_id`);
        externalIds.add(feature.external_id);
        assert.ok(!names.has(feature.name), `${at}: duplicate feature name on the device`);
        names.add(feature.name);
      }
    }
  });
}
