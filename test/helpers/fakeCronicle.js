// -----------------------------------------------------------------------------
// An in-memory Cronicle, behind the `request` seam of src/cronicle/client.js:
// the API as Cronicle 0.9.80 answers it (test/fixtures/cronicle hold the real
// answers this mimics): HTTP 200 for everything, `{ code: 0, … }` or
// `{ code: "api"|"session"|"event"|"job", description }`, the key copied into
// "Invalid API Key: <key>" and into the description of an aborted job.
// -----------------------------------------------------------------------------

export const BASE = 'http://192.0.2.10:3012';
export const API_KEY = 'cronicle_test_key_0000000000000001';
export const READ_KEY = 'cronicle_read_key_0000000000000002';

const json = (value) => ({ status: 200, body: JSON.stringify(value) });
const error = (code, description) => json({ code, description });

export class FakeCronicle {
  constructor() {
    this.events = [];
    this.active = new Map();
    this.history = []; // newest first, as Cronicle stores logs/completed
    this.next = 1;
    this.requests = [];
    this.down = null; // an error code: every request fails
    this.status = null; // an HTTP status: every request answers it
    this.time = Date.UTC(2026, 9, 26, 9, 0, 0) / 1000; // seconds, like Cronicle
    this.request = this.request.bind(this);
  }

  addEvent(id, title, { timing = {}, enabled = 1 } = {}) {
    this.events.unshift({
      enabled,
      title,
      category: 'general',
      target: 'allgrp',
      plugin: 'shellplug',
      // A script may carry secrets: the integration must never keep it.
      params: { script: '#!/bin/sh\nexport TOKEN=s3cr3t\nexit 0\n', annotate: 0, json: 0 },
      timing,
      timezone: 'Europe/Paris',
      max_children: 1,
      id,
      username: 'admin',
    });
  }

  event(title) {
    return this.events.find((event) => event.title === title);
  }

  /** A job of an event starts now. */
  start(title, { source = 'Scheduler' } = {}) {
    const event = this.event(title);
    const job = {
      ...structuredClone(event),
      id: `jtest${String(this.next++).padStart(6, '0')}`,
      event: event.id,
      event_title: event.title,
      plugin_title: 'Shell Script',
      category_title: 'General',
      source,
      time_start: this.time,
      hostname: 'main',
      log_file: `/opt/cronicle/logs/jobs/x.log`,
      pid: 61,
    };
    delete job.title;
    delete job.enabled;
    delete job.timing;
    delete job.username;
    this.active.set(job.id, job);
    return job;
  }

  /** A running job ends; code 0 succeeds. */
  finish(job, { code = 0, description = '', elapsed = 5 } = {}) {
    this.active.delete(job.id);
    const end = job.time_start + elapsed;
    this.time = Math.max(this.time, end);
    Object.assign(job, { complete: 1, code, description, time_end: end, elapsed });
    const stub = {
      id: job.id,
      code,
      event: job.event,
      category: 'general',
      plugin: 'shellplug',
      hostname: job.hostname,
      time_start: job.time_start,
      elapsed,
      perf: '',
      cpu: {},
      mem: {},
      log_file_size: 193,
      action: 'job_complete',
      epoch: Math.floor(end),
      event_title: job.event_title,
      category_title: 'General',
      plugin_title: 'Shell Script',
    };
    if (code) {
      stub.description = description || 'Unknown Error';
    }
    this.history.unshift(stub);
    this.finished ??= new Map();
    this.finished.set(job.id, job);
    return stub;
  }

  /** A job that ran and ended, `minutes` later. */
  ran(title, options = {}) {
    this.time += 60;
    return this.finish(this.start(title), options);
  }

  async request(url, { method = 'GET', headers = {}, body } = {}) {
    this.requests.push({ url, method, headers, body });
    if (this.down) {
      throw Object.assign(new Error('fetch failed'), { cause: { code: this.down } });
    }
    if (this.status) {
      return { status: this.status, body: '' };
    }
    const { pathname, searchParams } = new URL(url);
    const name = pathname.replace(/^\/api\/app\//, '');
    const params = { ...Object.fromEntries(searchParams), ...(body ? JSON.parse(body) : {}) };
    const key = headers['x-api-key'];
    if (!key) {
      return error('session', 'No Session ID or API Key could be found');
    }
    if (key !== API_KEY && key !== READ_KEY) {
      return error('api', `Invalid API Key: ${key}`);
    }
    const privileged = key === API_KEY;
    const title = privileged ? 'gladys-full' : 'gladys-ro';
    const lack = (priv) =>
      error(
        'api',
        `API Key ('${title}') does not have the required privileges to perform this action (${priv}).`,
      );
    switch (name) {
      case 'get_schedule':
        return json({ code: 0, rows: this.events, list: { length: this.events.length } });
      case 'get_active_jobs':
        return json({ code: 0, jobs: Object.fromEntries(this.active) });
      case 'get_history': {
        const rows = this.history.slice(0, Number(params.limit ?? 50));
        return json({ code: 0, rows, list: { length: this.history.length } });
      }
      case 'get_event_history': {
        if (!this.events.some((event) => event.id === params.id)) {
          return error('event', `Failed to locate event: ${params.id}`);
        }
        const rows = this.history
          .filter((row) => row.event === params.id)
          .slice(0, Number(params.limit ?? 100));
        return json({ code: 0, rows, list: { length: rows.length } });
      }
      case 'get_job_status': {
        const job = this.active.get(params.id) ?? this.finished?.get(params.id);
        if (!job) {
          return error(
            'job',
            `Failed to fetch job details: Error: Failed to fetch key: jobs/${params.id}: File not found`,
          );
        }
        return json({ code: 0, job });
      }
      case 'run_event': {
        if (method !== 'POST') {
          break;
        }
        if (!privileged) {
          return lack('run_events');
        }
        const event = this.events.find((item) => item.id === params.id);
        if (!event) {
          return error('event', `Failed to locate event: ${params.id}`);
        }
        if ([...this.active.values()].some((job) => job.event === event.id)) {
          return json({ code: 0, ids: [], queue: 1 });
        }
        const job = this.start(event.title, { source: `API Key (${title})` });
        return json({ code: 0, ids: [job.id] });
      }
      case 'abort_job': {
        if (!privileged) {
          return lack('abort_events');
        }
        const job = this.active.get(params.id);
        if (!job) {
          return error('job', `Failed to abort job: Job not found: ${params.id}`);
        }
        this.finish(job, {
          code: 1,
          description: `Job Aborted: Manually aborted by API Key: ${key} (${title})`,
          elapsed: this.time - job.time_start + 1,
        });
        return json({ code: 0 });
      }
    }
    return { status: 404, body: '<h1>Not found</h1>' };
  }
}

/** Three events, a success and a failure already. */
export function sampleCronicle() {
  const cronicle = new FakeCronicle();
  cronicle.addEvent('ebackup0001', 'Nightly backup');
  cronicle.addEvent('ediskchk002', 'Disk check', { timing: false });
  cronicle.addEvent('esync000003', 'Long sync', { timing: false });
  cronicle.ran('Nightly backup', { elapsed: 34.5 });
  cronicle.ran('Disk check', { code: 3, description: 'Script exited with code: 3: disk full' });
  return cronicle;
}
