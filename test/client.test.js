// The client against the real answers of Cronicle 0.9.80 (test/fixtures/cronicle).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CronicleClient, CronicleError, redact } from '../src/cronicle/client.js';

const KEY = 'cronicle_test_key_0000000000000001';
const fixture = (name) =>
  readFile(new URL(`./fixtures/cronicle/${name}.json`, import.meta.url), 'utf8');

function clientWith(answers, requests = []) {
  return new CronicleClient({
    url: 'http://192.0.2.10:3012',
    apiKey: KEY,
    request: async (url, options) => {
      requests.push({ url, ...options });
      const name = new URL(url).pathname.replace('/api/app/', '');
      const answer = answers[name];
      if (answer instanceof Error) {
        throw answer;
      }
      return typeof answer === 'object' ? answer : { status: 200, body: await fixture(answer) };
    },
  });
}

test('the schedule: events without their script', async () => {
  const requests = [];
  const client = clientWith({ get_schedule: 'get_schedule' }, requests);
  const events = await client.schedule();
  assert.deepEqual(
    events.map((e) => [e.title, e.scheduled, e.enabled]),
    [
      ['Long sync', false, true],
      ['Disk check fails', false, true],
      ['Backup OK', true, true],
    ],
  );
  assert.equal(JSON.stringify(events).includes('#!/bin/sh'), false);
  assert.equal(requests[0].headers['x-api-key'], KEY);
  assert.equal(requests[0].url.includes(KEY), false, 'the key never goes in the URL');
});

test('the history: success, failure with its message, aborted with the key hidden', async () => {
  const client = clientWith({ get_history: 'get_history' });
  const jobs = await client.history();
  const failed = jobs.find((job) => job.code === 3);
  assert.equal(failed.status, 'error');
  assert.equal(failed.description, 'Script exited with code: 3: disk full on /var');
  assert.equal(failed.elapsed, 0.1);
  const aborted = jobs.find((job) => job.status === 'aborted');
  assert.equal(aborted.description, 'Job Aborted: Manually aborted by API Key: *** (gladys-full)');
  const ok = jobs.find((job) => job.code === 0);
  assert.equal(ok.status, 'success');
  assert.ok(ok.end > ok.start);
  assert.equal(JSON.stringify(jobs).includes(KEY), false);
});

test('active jobs and job status, running then complete', async () => {
  const running = await clientWith({ get_active_jobs: 'get_active_jobs' }).activeJobs();
  assert.equal(running.length, 2);
  assert.ok(running.every((job) => job.status === 'running' && job.start > 0));
  assert.equal(JSON.stringify(running).includes('log_file'), false);
  const live = await clientWith({ get_job_status: 'get_job_status-running' }).job('x');
  assert.equal(live.status, 'running');
  const done = await clientWith({ get_job_status: 'get_job_status-done' }).job('x');
  assert.equal(done.status, 'success');
  assert.equal(done.code, 0);
});

test('run and abort: the ids, then the errors as Cronicle words them (always HTTP 200)', async () => {
  assert.deepEqual(await clientWith({ run_event: 'run_event' }).run('e1'), {
    ids: ['jmvpg2yof07'],
    queued: false,
  });
  await clientWith({ abort_job: 'abort_job' }).abort('j1');
  const kinds = [
    ['run_event', 'run_event-readonly', 'forbidden'],
    ['abort_job', 'abort_job-readonly', 'forbidden'],
    ['run_event', 'run_event-unknown', 'not_found'],
    ['get_schedule', 'bad-key', 'auth'],
    ['get_schedule', 'no-key', 'auth'],
    ['get_job_status', 'get_job_status-unknown', 'not_found'],
  ];
  for (const [name, answer, kind] of kinds) {
    const client = clientWith({ [name]: answer });
    const call =
      name === 'run_event'
        ? client.run('e1')
        : name === 'abort_job'
          ? client.abort('j1')
          : name === 'get_job_status'
            ? client.job('j1')
            : client.schedule();
    await assert.rejects(call, (err) => {
      assert.ok(err instanceof CronicleError);
      assert.equal(err.kind, kind, answer);
      assert.equal(err.message.includes('wrongkey'), false);
      return true;
    });
  }
});

test('network failures, redirects and other servers', async () => {
  const cases = [
    [Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } }), 'unreachable'],
    [Object.assign(new Error('t'), { name: 'TimeoutError' }), 'timeout'],
    [Object.assign(new Error('c'), { cause: { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' } }), 'tls'],
    [{ status: 302, body: '' }, 'redirect'],
    [{ status: 404, body: 'Not found' }, 'not_cronicle'],
    [{ status: 200, body: '<html></html>' }, 'not_cronicle'],
    [{ status: 200, body: '{"hello": 1}' }, 'not_cronicle'],
    [{ status: 500, body: '' }, 'http'],
  ];
  for (const [answer, kind] of cases) {
    await assert.rejects(clientWith({ get_schedule: answer }).schedule(), { kind });
  }
});

test('redact hides the configured key and whatever follows "API Key:"', () => {
  assert.equal(redact(`Invalid API Key: ${KEY}`, KEY), 'Invalid API Key: ***');
  assert.equal(redact('Invalid API Key: other-key', KEY), 'Invalid API Key: ***');
  assert.equal(
    redact("API Key ('ro') does not have the required privileges", KEY),
    "API Key ('ro') does not have the required privileges",
  );
  assert.equal(redact('line one\nline two'), 'line one');
  assert.equal(redact('x'.repeat(300)).length, 200);
  assert.equal(redact(undefined), '');
});
