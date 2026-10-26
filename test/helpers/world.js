// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Cronicle, a temporary
// /data and a manual clock, with the integration wired on top through
// registerHandlers. No timer runs unless asked: the tests read Cronicle with
// `world.hub.pollNow()`. (From guim31/gladys-semaphore.)
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { eventIds } from '../../src/devices.js';
import { Store } from '../../src/store.js';
import { API_KEY, BASE, FakeCronicle, READ_KEY, sampleCronicle } from './fakeCronicle.js';

// The integration logs every change; keep the test output readable.
process.env.LOG_LEVEL ??= 'silent';

/** A manual clock, shared by the hub and the tests. */
export function createClock(start = Date.UTC(2026, 9, 26, 10, 0, 0)) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const CONFIG = { url: BASE, api_key: API_KEY, allow_run: true, language: 'en' };

export async function createWorld({
  clock = createClock(),
  cronicle = sampleCronicle(),
  config = CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-cronicle-')),
  timings = { waitStepMs: 5, commandReadMs: 50 },
  timers = false,
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: cronicle.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, cronicle, app, hub: app.hub, clock, dataDir };
}

/** External ids of the device of an event of the fake, by title. */
export const idsOf = (world, title) => eventIds(world.gladys, world.cronicle.event(title).id);

/** Add discovered devices in Gladys, as the user would (all by default). */
export async function createDevices(world, filter = () => true) {
  for (const device of world.fake.discoveredDevices.filter(filter)) {
    await world.fake.deviceCreated(device);
  }
}

export { API_KEY, BASE, FakeCronicle, READ_KEY, sampleCronicle };
