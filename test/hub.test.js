import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { TRIGGERS } from '../src/hub.js';
import { serverIds } from '../src/devices.js';
import {
  API_KEY,
  CONFIG,
  createClock,
  createDevices,
  createWorld,
  idsOf,
  sampleCronicle,
} from './helpers/world.js';

const events = (world, key) => world.fake.sceneEvents.filter((event) => event.key === key);
const names = (requests) => requests.map((r) => new URL(r.url).pathname.replace('/api/app/', ''));

async function captureLogs(t, level, fn) {
  const lines = [];
  const write = (chunk) => {
    lines.push(...String(chunk).split('\n').filter(Boolean));
    return true;
  };
  const before = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const stdout = t.mock.method(process.stdout, 'write', write);
  const stderr = t.mock.method(process.stderr, 'write', write);
  try {
    await fn();
  } finally {
    stdout.mock.restore();
    stderr.mock.restore();
    process.env.LOG_LEVEL = before;
  }
  return lines;
}

test('the server and one device per event, nothing polled by Gladys, no command', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const devices = world.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((device) => device.name),
    ['Cronicle', 'Disk check', 'Long sync', 'Nightly backup'],
  );
  assert.equal(devices[0].external_id, serverIds(world.gladys).device);
  assert.deepEqual(devices[0].params, [{ name: 'HOST', value: '192.0.2.10:3012' }]);
  assert.equal(devices[1].external_id, idsOf(world, 'Disk check').device);
  assert.deepEqual(devices[1].params, [{ name: 'EVENT_ID', value: 'ediskchk002' }]);
  assert.ok(devices.every((device) => device.should_poll === false));
  assert.ok(devices.every((device) => device.features.every((f) => f.read_only === true)));
  assert.equal(world.fake.connectionStatus.connected, true);
  // Never the script of an event.
  assert.equal(JSON.stringify(devices).includes('s3cr3t'), false);
});

test('a list of events restricts the followed ones; unknown and invalid ids are reported', async (t) => {
  const world = await createWorld({
    config: { ...CONFIG, events: 'ebackup0001, enope000009, bad-id!' },
  });
  t.after(() => world.app.stop());
  assert.deepEqual(
    world.fake.discoveredDevices.map((device) => device.name),
    ['Cronicle', 'Nightly backup'],
  );
  const report = await world.fake.action('test_connection', {});
  assert.match(report.data.message.en, /Followed but not found: enope000009/);
  assert.match(report.data.message.en, /Not understood in the list: bad-id!/);
  assert.match(report.data.message.en, /ediskchk002: Disk check\n/);
  assert.match(report.data.message.en, /ebackup0001: Nightly backup ✓ followed/);
  assert.match(report.data.message.en, /Running from Gladys is on/);
});

test('the states: server counts, then each event status, success, running, last run, duration', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const server = serverIds(world.gladys);
  assert.equal(world.fake.lastState(server.feature('reachable')), 1);
  assert.equal(world.fake.lastState(server.feature('running_jobs')), 0);
  assert.equal(world.fake.lastState(server.feature('failures_24h')), 1);

  const ok = idsOf(world, 'Nightly backup');
  const broken = idsOf(world, 'Disk check');
  const fresh = idsOf(world, 'Long sync');
  assert.equal(world.fake.lastState(ok.feature('status')), 'Succeeded');
  assert.equal(world.fake.lastState(ok.feature('succeeded')), 1);
  assert.equal(world.fake.lastState(ok.feature('running')), 0);
  assert.equal(world.fake.lastState(ok.feature('duration')), 34.5);
  assert.match(world.fake.lastState(ok.feature('last_run')), /^26\/10,? \d\d:\d\d$/);
  assert.equal(world.fake.lastState(broken.feature('status')), 'Failed');
  assert.equal(world.fake.lastState(broken.feature('succeeded')), 0);
  assert.equal(world.fake.lastState(fresh.feature('status')), 'Never run');
  assert.equal(world.fake.lastState(fresh.feature('succeeded')), undefined);

  // A job starts: running, the last success and duration stay.
  const job = world.cronicle.start('Nightly backup');
  await world.hub.pollNow();
  assert.equal(world.fake.lastState(ok.feature('status')), 'Running');
  assert.equal(world.fake.lastState(ok.feature('running')), 1);
  assert.equal(world.fake.lastState(ok.feature('succeeded')), 1);
  assert.equal(world.fake.lastState(server.feature('running_jobs')), 1);
  world.cronicle.finish(job, { code: 2, description: 'boom', elapsed: 8 });
  await world.hub.pollNow();
  assert.equal(world.fake.lastState(ok.feature('status')), 'Failed');
  assert.equal(world.fake.lastState(ok.feature('running')), 0);
  assert.equal(world.fake.lastState(ok.feature('succeeded')), 0);
  assert.equal(world.fake.lastState(ok.feature('duration')), 8);
  assert.equal(world.fake.lastState(server.feature('failures_24h')), 2);
});

test('the end of a job fires its trigger once, never for the past', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  assert.equal(world.fake.sceneEvents.length, 0, 'the first read announces nothing');

  const job = world.cronicle.start('Long sync');
  await world.hub.pollNow();
  assert.equal(world.fake.sceneEvents.length, 0, 'running: nothing yet');
  world.cronicle.finish(job, { elapsed: 61 });
  await world.hub.pollNow();
  await world.hub.pollNow();
  assert.deepEqual(events(world, TRIGGERS.SUCCEEDED), [
    {
      key: TRIGGERS.SUCCEEDED,
      data: {
        device: idsOf(world, 'Long sync').device,
        event: 'Long sync',
        job_id: job.id,
        duration: 61,
      },
    },
  ]);

  world.cronicle.ran('Disk check', {
    code: 3,
    description: 'Script exited with code: 3: disk full',
  });
  await world.hub.pollNow();
  const [failed] = events(world, TRIGGERS.FAILED);
  assert.equal(failed.data.event, 'Disk check');
  assert.equal(failed.data.code, 3);
  assert.equal(failed.data.message, 'Script exited with code: 3: disk full');
});

test('an aborted job is a failure, and the key Cronicle copies into its message is hidden', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const job = world.cronicle.start('Long sync');
  await world.hub.pollNow();
  const ack = await world.fake.sceneAction('abort_job', {
    device: idsOf(world, 'Long sync').device,
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { aborted: true, job_id: job.id });
  await world.hub.pollNow();
  const [failed] = events(world, TRIGGERS.FAILED);
  assert.equal(failed.data.message, 'Job Aborted: Manually aborted by API Key: *** (gladys-full)');
  assert.equal(JSON.stringify(world.fake.sceneEvents).includes(API_KEY), false);
  assert.equal(world.hub.events.get('esync000003').lastJob.status, 'aborted');
});

test('a job that ended while the integration was stopped is announced once after the restart', async (t) => {
  const clock = createClock();
  const cronicle = sampleCronicle();
  const first = await createWorld({ clock, cronicle });
  cronicle.ran('Nightly backup');
  await first.app.stop();

  const second = await createWorld({ clock, cronicle, dataDir: first.dataDir });
  t.after(() => second.app.stop());
  assert.equal(events(second, TRIGGERS.SUCCEEDED).length, 1);
  await second.app.stop();

  const third = await createWorld({ clock, cronicle, dataDir: first.dataDir });
  t.after(() => third.app.stop());
  assert.equal(third.fake.sceneEvents.length, 0, 'never twice');
});

test('an event whose last job is older than the history read is asked once', async (t) => {
  const cronicle = sampleCronicle();
  for (let i = 0; i < 101; i += 1) {
    cronicle.ran('Nightly backup', { elapsed: 1 });
  }
  const world = await createWorld({ cronicle });
  t.after(() => world.app.stop());
  assert.equal(world.hub.events.get('ediskchk002').lastJob.code, 3);
  assert.equal(names(cronicle.requests).filter((n) => n === 'get_event_history').length, 2);
  cronicle.requests.length = 0;
  await world.hub.pollNow();
  assert.deepEqual(names(cronicle.requests), ['get_schedule', 'get_active_jobs', 'get_history']);
});

test('a job running longer than the threshold fires "stuck" once', async (t) => {
  const clock = createClock();
  const world = await createWorld({ clock, config: { ...CONFIG, stuck_minutes: '30' } });
  t.after(() => world.app.stop());
  const job = world.cronicle.start('Long sync');
  world.cronicle.time = clock.now() / 1000;
  job.time_start = clock.now() / 1000;
  await world.hub.pollNow();
  clock.advance(29 * 60_000);
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.STUCK).length, 0);
  clock.advance(2 * 60_000);
  await world.hub.pollNow();
  await world.hub.pollNow();
  assert.deepEqual(events(world, TRIGGERS.STUCK), [
    {
      key: TRIGGERS.STUCK,
      data: {
        device: idsOf(world, 'Long sync').device,
        event: 'Long sync',
        job_id: job.id,
        minutes: 31,
      },
    },
  ]);
});

test('no "stuck" trigger when the threshold is Never', async (t) => {
  const clock = createClock();
  const world = await createWorld({ clock, config: { ...CONFIG, stuck_minutes: '0' } });
  t.after(() => world.app.stop());
  world.cronicle.start('Long sync').time_start = clock.now() / 1000;
  clock.advance(10 * 3600_000);
  await world.hub.pollNow();
  assert.equal(events(world, TRIGGERS.STUCK).length, 0);
});

test('Cronicle lost then back: one trigger each, the badge and "reachable" follow', async (t) => {
  const clock = createClock();
  const world = await createWorld({ clock, config: { ...CONFIG, language: 'fr' } });
  t.after(() => world.app.stop());
  await createDevices(world);
  const server = serverIds(world.gladys);
  world.cronicle.down = 'ECONNREFUSED';
  await world.hub.pollNow();
  await world.hub.pollNow();
  assert.deepEqual(events(world, TRIGGERS.UNREACHABLE), [
    { key: TRIGGERS.UNREACHABLE, data: { reason: 'Cronicle ne répond pas' } },
  ]);
  assert.equal(world.fake.lastState(server.feature('reachable')), 0);
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.ok(world.fake.transports.some((entry) => entry.transport === 'unreachable'));

  clock.advance(7 * 60_000);
  world.cronicle.down = null;
  await world.hub.pollNow();
  await world.hub.pollNow();
  assert.deepEqual(events(world, TRIGGERS.BACK), [
    { key: TRIGGERS.BACK, data: { down_minutes: 7 } },
  ]);
  assert.equal(world.fake.lastState(server.feature('reachable')), 1);
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('Cronicle lost while the integration was stopped: announced at the start', async (t) => {
  const clock = createClock();
  const cronicle = sampleCronicle();
  const first = await createWorld({ clock, cronicle });
  await first.app.stop();
  cronicle.down = 'ECONNREFUSED';
  const second = await createWorld({ clock, cronicle, dataDir: first.dataDir });
  assert.equal(events(second, TRIGGERS.UNREACHABLE).length, 0, 'one failed read is not an outage');
  await second.hub.pollNow();
  await second.app.stop();
  assert.equal(events(second, TRIGGERS.UNREACHABLE).length, 1);
  clock.advance(3 * 60_000);
  cronicle.down = null;
  const third = await createWorld({ clock, cronicle, dataDir: first.dataDir });
  t.after(() => third.app.stop());
  assert.deepEqual(events(third, TRIGGERS.BACK), [
    { key: TRIGGERS.BACK, data: { down_minutes: 3 } },
  ]);
});

test('a wrong key typed is not "Cronicle stops answering", and is never logged', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const lines = await captureLogs(t, 'debug', async () => {
    await world.fake.configUpdated({ ...CONFIG, api_key: 'wrong-secret-key-123' });
    await world.hub.pollNow();
  });
  assert.equal(events(world, TRIGGERS.UNREACHABLE).length, 0);
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.en, /API key refused/);
  assert.equal(lines.join('\n').includes('wrong-secret-key-123'), false);
  assert.match(lines.join('\n'), /Invalid API Key: \*\*\*/);
});

test('another key announces nothing from the past', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  // Jobs the previous key could not see (another category), then a new key.
  world.cronicle.ran('Long sync');
  world.hub.saved.seen.push(world.cronicle.history[0].id);
  world.cronicle.history.splice(0, 0, { ...world.cronicle.history[0], id: 'jhidden0001' });
  await world.fake.configUpdated({ ...CONFIG, api_key: 'cronicle_read_key_0000000000000002' });
  assert.equal(world.fake.sceneEvents.length, 0);
});

test('a normal reading cycle writes nothing at the info level', async (t) => {
  const clock = createClock();
  const world = await createWorld({ clock });
  t.after(() => world.app.stop());
  await createDevices(world);
  const lines = await captureLogs(t, 'info', async () => {
    await world.hub.pollNow();
    clock.advance(60_000);
    await world.hub.pollNow();
  });
  assert.deepEqual(lines, []);
});

test('the container reads Cronicle on its own timer, faster while a job runs (no onPoll)', async (t) => {
  const world = await createWorld({
    timers: true,
    timings: { fastMs: 5, waitStepMs: 5, commandReadMs: 50 },
  });
  t.after(() => world.app.stop());
  const job = world.cronicle.start('Long sync');
  await world.hub.pollNow(); // seen running: the timer goes fast
  world.cronicle.finish(job);
  for (let i = 0; i < 100 && events(world, TRIGGERS.SUCCEEDED).length === 0; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.equal(events(world, TRIGGERS.SUCCEEDED).length, 1);
});

test('what is kept in /data holds neither the key nor a script', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.cronicle.start('Long sync');
  await world.hub.pollNow();
  await world.app.stop();
  const saved = await readFile(`${world.dataDir}/cronicle-state.json`, 'utf8');
  assert.equal(saved.includes(API_KEY), false);
  assert.equal(saved.includes('s3cr3t'), false);
  assert.ok(JSON.parse(saved).initialized);
});
