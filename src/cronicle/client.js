// -----------------------------------------------------------------------------
// Cronicle client: the REST API of a self-hosted Cronicle (`/api/app/…`),
// authenticated by an API key (`X-API-Key` header) created in Admin → API Keys.
//
//   GET  get_schedule          every event (with its plugin parameters:
//                              never kept, a script may hold secrets)
//   GET  get_active_jobs       the jobs running now, on every server
//   GET  get_history           the last completed jobs, newest first
//   GET  get_event_history     the last completed jobs of one event
//   GET  get_job_status        one job, running or completed
//   POST run_event             run an event now ("Run events" privilege)
//   POST abort_job             abort a running job ("Abort jobs" privilege)
//
// Checked on Cronicle 0.9.80 (test/fixtures/cronicle hold its answers).
// Every answer is HTTP 200, errors included: `{ code: "api"|"session"|
// "event"|"job", description }`, `code: 0` on success. A server that is not
// the primary answers 302 to the primary.
//
// Cronicle copies the API key into some texts: "Invalid API Key: <key>",
// "Job Aborted: Manually aborted by API Key: <key> (title)". Every text read
// from Cronicle goes through `redact` before being logged, kept or published.
// Redirects are not followed: the key would be sent wherever the address points.
// -----------------------------------------------------------------------------

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TIMEOUT: 'timeout', // no answer in time
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // key refused, disabled or missing
  FORBIDDEN: 'forbidden', // the key lacks a privilege (run, abort)
  NOT_CRONICLE: 'not_cronicle', // something answers, not the Cronicle API
  REDIRECT: 'redirect', // HTTP to HTTPS, or a server that is not the primary
  NOT_FOUND: 'not_found', // the event or the job no longer exists
  REFUSED: 'refused', // Cronicle refused a command, with its reason
  HTTP: 'http', // any other HTTP error
});

export class CronicleError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status, reason }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'CronicleError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// A schedule of a few hundred events (each with its script) stays far below
// this (the 256 MB of the sandbox too).
export const MAX_BODY_BYTES = 8 * 1024 * 1024;

async function readCapped(response, max) {
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > max) {
    await response.body?.cancel();
    throw Object.assign(new Error('Response too large'), { code: 'TOO_LARGE' });
  }
  if (!response.body) {
    return '';
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > max) {
      throw Object.assign(new Error('Response too large'), { code: 'TOO_LARGE' });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * The one function that talks to the network (fetch). The client takes it as
 * a parameter: the tests replace it with an in-memory Cronicle
 * (test/helpers/fakeCronicle.js).
 * @returns {Promise<{ status: number, body: string }>}
 */
export async function httpRequest(
  url,
  { method = 'GET', headers = {}, body, timeoutMs = 10_000, maxBytes = MAX_BODY_BYTES } = {},
) {
  const response = await fetch(url, {
    method,
    headers,
    body,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: response.status, body: await readCapped(response, maxBytes) };
}

/**
 * A text from Cronicle without any API key in it: the configured one, and
 * whatever follows "API Key:" (Cronicle writes the key there).
 */
export function redact(text, key = '', max = 200) {
  if (typeof text !== 'string') {
    return '';
  }
  let clean = text;
  if (key && key.length >= 4) {
    clean = clean.split(key).join('***');
  }
  clean = clean.replace(/(API Key:?\s+)(?!\*\*\*)[^\s()]+/gi, '$1***').trim();
  const line = clean.split('\n')[0].trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

// Job statuses, as the integration shows them. A job is "success" with code 0,
// "aborted" when Cronicle aborted it (by hand, timeout, server lost), "error"
// for any other code.
export const JOB_STATUSES = Object.freeze({
  RUNNING: 'running',
  SUCCESS: 'success',
  ERROR: 'error',
  ABORTED: 'aborted',
});

const secondsToMs = (value) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value * 1000)
    : null;

const nameOf = (value, fallback) =>
  (typeof value === 'string' && value.trim().slice(0, 255)) || fallback;

const idOf = (value) => (typeof value === 'string' && /^\w{1,40}$/.test(value) ? value : null);

/** One event of the schedule: never its parameters (script, URL, secrets). */
export function normalizeEvent(raw) {
  const id = idOf(raw?.id);
  if (!id) {
    return null;
  }
  return {
    id,
    title: nameOf(raw.title, id),
    enabled: raw.enabled === 1 || raw.enabled === true,
    // `timing: false` is "on demand", an object is a schedule.
    scheduled: Boolean(raw.timing) && typeof raw.timing === 'object',
    category: typeof raw.category === 'string' ? raw.category.slice(0, 40) : '',
    plugin: typeof raw.plugin === 'string' ? raw.plugin.slice(0, 40) : '',
  };
}

/** A running job (get_active_jobs, get_job_status): never params nor log path. */
export function normalizeActiveJob(raw, key) {
  const id = idOf(raw?.id);
  const event = idOf(raw?.event);
  if (!id || !event) {
    return null;
  }
  return {
    id,
    event,
    eventTitle: nameOf(raw.event_title, event),
    status: JOB_STATUSES.RUNNING,
    start: secondsToMs(raw.time_start),
    end: null,
    elapsed: null,
    code: null,
    description: '',
    hostname: redact(raw.hostname, key, 60),
  };
}

/**
 * A completed job (get_history rows, get_job_status once complete). The
 * description is the reason of a failure ("Script exited with code: 3: disk
 * full"), redacted.
 */
export function normalizeCompletedJob(raw, key) {
  const id = idOf(raw?.id);
  const event = idOf(raw?.event);
  // Rows of a deleted job ({ action: "job_delete" }) and rows masked for a
  // category the key may not see (id "") have no code.
  if (!id || !event || raw.code === undefined || raw.code === null) {
    return null;
  }
  const code = Number.isFinite(Number(raw.code)) ? Number(raw.code) : 1;
  const description = redact(raw.description, key);
  const start = secondsToMs(raw.time_start);
  const elapsed =
    typeof raw.elapsed === 'number' && Number.isFinite(raw.elapsed) && raw.elapsed >= 0
      ? Math.round(raw.elapsed * 10) / 10
      : null;
  const end =
    secondsToMs(raw.time_end) ??
    (start !== null && elapsed !== null ? start + Math.round(elapsed * 1000) : null) ??
    secondsToMs(raw.epoch);
  let status = JOB_STATUSES.ERROR;
  if (code === 0) {
    status = JOB_STATUSES.SUCCESS;
  } else if (/^(Job Aborted|Aborted Job)/i.test(description)) {
    status = JOB_STATUSES.ABORTED;
  }
  return {
    id,
    event,
    eventTitle: nameOf(raw.event_title, event),
    status,
    start,
    end,
    elapsed,
    code,
    description,
    hostname: redact(raw.hostname, key, 60),
  };
}

const parse = (body) => {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

export class CronicleClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, `http(s)://host[:port][/path]`
   * @param {string} options.apiKey API key (Admin → API Keys)
   * @param {typeof httpRequest} [options.request] test seam
   * @param {number} [options.timeoutMs]
   */
  constructor({ url, apiKey, request = httpRequest, timeoutMs = 10_000 }) {
    this.url = url;
    this.apiKey = apiKey;
    this.request = request;
    this.timeoutMs = timeoutMs;
  }

  async call(name, { query, body } = {}) {
    const headers = { 'x-api-key': this.apiKey, accept: 'application/json' };
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    const search = query ? `?${new URLSearchParams(query)}` : '';
    let response;
    try {
      response = await this.request(`${this.url}/api/app/${name}${search}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        timeoutMs: this.timeoutMs,
      });
    } catch (err) {
      const code = err.cause?.code ?? err.code;
      if (TLS_CODES.has(code)) {
        throw new CronicleError(ERROR_KINDS.TLS, `Certificate refused (${code})`);
      }
      if (err.name === 'TimeoutError' || code === 23) {
        throw new CronicleError(ERROR_KINDS.TIMEOUT, 'No answer in time');
      }
      throw new CronicleError(ERROR_KINDS.UNREACHABLE, String(code ?? err.name ?? err.message));
    }
    return this.check(response);
  }

  /** The JSON of a successful answer; a CronicleError otherwise. */
  check({ status, body }) {
    if (status >= 300 && status < 400) {
      throw new CronicleError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    if (status === 401 || status === 403) {
      throw new CronicleError(ERROR_KINDS.AUTH, `Refused (HTTP ${status})`, { status });
    }
    const data = parse(body);
    if (status === 404 || (status === 200 && (!data || typeof data !== 'object'))) {
      throw new CronicleError(ERROR_KINDS.NOT_CRONICLE, `No Cronicle API here (HTTP ${status})`, {
        status,
      });
    }
    if (status !== 200) {
      throw new CronicleError(ERROR_KINDS.HTTP, `Unexpected answer (HTTP ${status})`, { status });
    }
    if (data.code === 0) {
      return data;
    }
    if (data.code === undefined) {
      throw new CronicleError(ERROR_KINDS.NOT_CRONICLE, 'The answer is not the Cronicle API');
    }
    const reason = redact(data.description, this.apiKey, 150);
    const what = `${data.code}: ${reason}`;
    if (data.code === 'session' || /Invalid API Key|API Key is (disabled|invalid)/i.test(reason)) {
      throw new CronicleError(ERROR_KINDS.AUTH, `Key refused (${what})`, { reason });
    }
    if (/required privileges/i.test(reason)) {
      throw new CronicleError(ERROR_KINDS.FORBIDDEN, `Privilege missing (${what})`, { reason });
    }
    if (/Failed to (locate event|fetch job)/i.test(reason)) {
      throw new CronicleError(ERROR_KINDS.NOT_FOUND, `Not found (${what})`, { reason });
    }
    throw new CronicleError(ERROR_KINDS.REFUSED, `Refused (${what})`, { reason });
  }

  rows(data, normalize) {
    if (!Array.isArray(data.rows)) {
      throw new CronicleError(ERROR_KINDS.NOT_CRONICLE, 'The answer is not a Cronicle list');
    }
    return data.rows.map((row) => normalize(row, this.apiKey)).filter(Boolean);
  }

  /** Every event of the schedule. */
  async schedule() {
    return this.rows(
      await this.call('get_schedule', { query: { offset: 0, limit: 1000 } }),
      normalizeEvent,
    );
  }

  /** The jobs running now. */
  async activeJobs() {
    const data = await this.call('get_active_jobs');
    if (!data.jobs || typeof data.jobs !== 'object') {
      throw new CronicleError(ERROR_KINDS.NOT_CRONICLE, 'The answer is not a Cronicle job list');
    }
    return Object.values(data.jobs)
      .map((job) => normalizeActiveJob(job, this.apiKey))
      .filter(Boolean);
  }

  /** The last completed jobs of every event, newest first. */
  async history(limit = 100) {
    return this.rows(
      await this.call('get_history', { query: { offset: 0, limit } }),
      normalizeCompletedJob,
    );
  }

  /** The last completed jobs of an event, newest first. */
  async eventHistory(eventId, limit = 1) {
    return this.rows(
      await this.call('get_event_history', { query: { id: eventId, offset: 0, limit } }),
      normalizeCompletedJob,
    );
  }

  /** One job, running or completed. */
  async job(jobId) {
    const data = await this.call('get_job_status', { query: { id: jobId } });
    const job =
      data.job?.complete === 1 || data.job?.complete === true
        ? normalizeCompletedJob(data.job, this.apiKey)
        : normalizeActiveJob(data.job, this.apiKey);
    if (!job) {
      throw new CronicleError(ERROR_KINDS.NOT_CRONICLE, 'The answer is not a Cronicle job');
    }
    return job;
  }

  /**
   * Run an event now.
   * @returns {Promise<{ ids: string[], queued: boolean }>} the jobs started;
   *   none when Cronicle queued the run (event already at its limit)
   */
  async run(eventId) {
    const data = await this.call('run_event', { body: { id: eventId } });
    const ids = Array.isArray(data.ids) ? data.ids.map(idOf).filter(Boolean) : [];
    return { ids, queued: ids.length === 0 };
  }

  async abort(jobId) {
    await this.call('abort_job', { body: { id: jobId } });
  }
}
