import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEY } from '../src/hub.js';
import { buildEventDevice } from '../src/devices.js';
import { CONFIG, READ_KEY, createDevices, createWorld, idsOf } from './helpers/world.js';

const posts = (world) =>
  world.cronicle.requests
    .filter((r) => r.method === 'POST')
    .map((r) => new URL(r.url).pathname.replace('/api/app/', ''));

test('"Run a Cronicle event" is refused while running from Gladys is off (the default)', async (t) => {
  const world = await createWorld({ config: { ...CONFIG, allow_run: undefined, language: 'fr' } });
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('run_event', {
    device: idsOf(world, 'Nightly backup').device,
  });
  assert.equal(ack.success, false);
  assert.match(ack.error, /lancement d'événements depuis Gladys est désactivé/);
  const abort = await world.fake.sceneAction('abort_job', {
    device: idsOf(world, 'Nightly backup').device,
  });
  assert.equal(abort.success, false);
  assert.deepEqual(posts(world), []);
});

test('"Run a Cronicle event": the job as outputs, then its end when waiting', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('run_event', {
    device: idsOf(world, 'Nightly backup').device,
  });
  assert.equal(ack.success, true, ack.error);
  const [job] = world.cronicle.active.values();
  assert.deepEqual(ack.data.outputs, {
    job_id: job.id,
    queued: false,
    finished: false,
    success: false,
    status: 'Running',
    code: 0,
    message: '',
    duration: 0,
  });
  assert.deepEqual(posts(world), ['run_event']);
  assert.deepEqual(JSON.parse(world.cronicle.requests.find((r) => r.method === 'POST').body), {
    id: 'ebackup0001',
  });

  // Already running: Cronicle queues the run, no job id.
  const queued = await world.fake.sceneAction('run_event', {
    device: idsOf(world, 'Nightly backup').device,
  });
  assert.equal(queued.data.outputs.queued, true);
  world.cronicle.finish(job);

  // Waiting: the job ends while the action waits.
  const original = world.cronicle.request;
  let reads = 0;
  world.cronicle.request = async (url, options) => {
    const answer = await original(url, options);
    if (url.includes('get_job_status') && ++reads === 2) {
      const running = [...world.cronicle.active.values()][0];
      world.cronicle.finish(running, {
        code: 4,
        description: 'Script exited with code: 4',
        elapsed: 3,
      });
    }
    return answer;
  };
  world.hub.client.request = world.cronicle.request;
  const waited = await world.fake.sceneAction('run_event', {
    device: idsOf(world, 'Long sync').device,
    wait: true,
  });
  assert.equal(waited.success, true, waited.error);
  assert.equal(waited.data.outputs.finished, true);
  assert.equal(waited.data.outputs.success, false);
  assert.equal(waited.data.outputs.status, 'Failed');
  assert.equal(waited.data.outputs.code, 4);
  assert.equal(waited.data.outputs.message, 'Script exited with code: 4');
});

test('a key without the Run events privilege: a clear error', async (t) => {
  const world = await createWorld({ config: { ...CONFIG, api_key: READ_KEY } });
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('run_event', {
    device: idsOf(world, 'Nightly backup').device,
  });
  assert.equal(ack.success, false);
  assert.match(ack.error, /lacks the privilege/);
});

test('an event that is not followed is refused, whatever asks', async (t) => {
  const world = await createWorld({ config: { ...CONFIG, events: 'ebackup0001' } });
  t.after(() => world.app.stop());
  for (const device of [idsOf(world, 'Disk check').device, 'other:event:x', '']) {
    const ack = await world.fake.sceneAction('run_event', { device });
    assert.equal(ack.success, false, device);
    assert.match(ack.error, /not followed/);
  }
  assert.deepEqual(posts(world), []);
});

test('"Read a Cronicle event": state and last result, for a scene condition', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('get_event', {
    device: idsOf(world, 'Disk check').device,
  });
  assert.equal(ack.success, true, ack.error);
  const { last_run: lastRun, ...outputs } = ack.data.outputs;
  assert.deepEqual(outputs, {
    status: 'Failed',
    running: false,
    success: false,
    code: 3,
    message: 'Script exited with code: 3: disk full',
    duration: 5,
    enabled: true,
  });
  assert.match(lastRun, /^26\/10/);
});

test('"Abort a Cronicle job": nothing running is not an error', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const ack = await world.fake.sceneAction('abort_job', {
    device: idsOf(world, 'Long sync').device,
  });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(ack.data.outputs, { aborted: false, job_id: '' });
  assert.deepEqual(posts(world), []);
});

test('the widget: last runs, running first, valid for the core, no buttons by default', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.cronicle.start('Long sync');
  await world.hub.pollNow();
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'fr' });
  assert.equal(ack.success, true, ack.error);
  const { content } = ack.data;
  assert.deepEqual(validateWidgetContent(content), []);
  const [list, refresh] = content.components;
  assert.equal(list.type, 'status');
  assert.deepEqual(
    list.items.map((item) => item.label),
    ['Long sync', 'Disk check', 'Nightly backup'],
  );
  assert.match(list.items[0].value, /^En cours · 26\/10/);
  assert.match(list.items[1].value, /^En échec · 26\/10.* · 5 s$/);
  assert.equal(refresh.action.key, 'refresh');
  assert.equal(content.ttl_seconds, 10);
});

test('the widget: Run / Abort buttons for the chosen events, confirmed, checked again', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  await createDevices(world);
  const settings = {
    events: [idsOf(world, 'Nightly backup').device, idsOf(world, 'Long sync').device],
  };
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings, language: 'en' });
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
  const buttons = ack.data.content.components.filter((c) => c.type === 'button');
  assert.deepEqual(
    buttons.map((b) => [b.label, b.action.key, b.action.confirm]),
    [
      ['Run Long sync', 'run_esync000003', true],
      ['Run Nightly backup', 'run_ebackup0001', true],
      ['Refresh', 'refresh', undefined],
    ],
  );
  // The rows are the chosen events only.
  const list = ack.data.content.components.find((c) => c.type === 'status');
  assert.deepEqual(
    list.items.map((item) => item.label),
    ['Nightly backup'],
  );
  // Every device a setting may name exists in the discovery.
  const discovered = new Set(world.fake.discoveredDevices.map((d) => d.external_id));
  for (const event of world.hub.events.values()) {
    assert.ok(discovered.has(buildEventDevice(world.gladys, event).external_id));
  }

  const run = await world.fake.widgetAction(WIDGET_KEY, 'run_esync000003', {
    event: 'esync000003',
  });
  assert.equal(run.success, true, run.error);
  assert.equal(run.data.message.en, 'Job started.');
  const again = await world.fake.widgetGet(WIDGET_KEY, { settings, language: 'en' });
  const abort = again.data.content.components.find((c) => c.action?.key === 'abort_esync000003');
  assert.equal(abort.label, 'Abort Long sync');
  const aborted = await world.fake.widgetAction(WIDGET_KEY, 'abort_esync000003', {
    event: 'esync000003',
  });
  assert.equal(aborted.data.message.en, 'Abort requested.');

  // A key and params that disagree, or running switched off: refused.
  const forged = await world.fake.widgetAction(WIDGET_KEY, 'run_esync000003', {
    event: 'ebackup0001',
  });
  assert.equal(forged.success, false);
  await world.fake.configUpdated({ ...CONFIG, allow_run: false });
  const off = await world.fake.widgetAction(WIDGET_KEY, 'run_ebackup0001', {
    event: 'ebackup0001',
  });
  assert.equal(off.success, false);
  const noButtons = await world.fake.widgetGet(WIDGET_KEY, { settings, language: 'en' });
  assert.deepEqual(
    noButtons.data.content.components.filter((c) => c.type === 'button').map((b) => b.action.key),
    ['refresh'],
  );
});

test('the widget says why when Cronicle does not answer or is not configured', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  world.cronicle.down = 'ECONNREFUSED';
  const refreshed = await world.fake.widgetAction(WIDGET_KEY, 'refresh', {});
  assert.equal(refreshed.data.message.en, 'Cronicle does not answer');
  const ack = await world.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'de' });
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
  assert.equal(ack.data.content.components[0].text, 'Cronicle antwortet nicht');

  const empty = await createWorld({ config: { language: 'en' } });
  t.after(() => empty.app.stop());
  const message = await empty.fake.widgetGet(WIDGET_KEY, { settings: {}, language: 'es' });
  assert.match(message.data.content.components[0].text, /dirección de su Cronicle/);
});
