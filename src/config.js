// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One Cronicle instance (its primary server): its address, an API key
// (created in Admin → API Keys), the events to follow (every event by
// default, or a list of event ids) and whether Gladys may run them: off by
// default, like the "Run events" privilege of the key.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['30', '60', '120', '300'];

// "A job is stuck" thresholds, in minutes; 0 turns the trigger off.
export const STUCK_MINUTES = ['0', '15', '30', '60', '120', '240'];

// The port Cronicle listens on by default: added to a bare host typed without one.
export const DEFAULT_PORT = 3012;

// Events followed, at most (one device each).
export const MAX_EVENTS = 50;

export const DEFAULT_CONFIG = {
  url: '',
  api_key: '',
  events: '',
  allow_run: false,
  stuck_minutes: '60',
  poll_interval: '60',
  language: 'fr',
};

// Pages of the web interface and the API root: a URL copied from the browser
// points at one of them (`/#Schedule`, `/api/app/…`), Cronicle lives at the root.
const INTERFACE_PATH = /\/(api)(\/.*)?$/i;

/**
 * Parse the address typed by the user into a base URL: a bare host or IP
 * (`192.0.2.10`, port 3012 added), `host:port`, or a URL copied from the
 * browser (`http://cronicle.lan:3012/#Schedule`). HTTP by default for a bare
 * host. A sub-path (reverse proxy) is kept.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/path]`, null when unusable
 */
export function parseServerUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(hasScheme ? text : `http://${text}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs.
  if (url.username || url.password) {
    return null;
  }
  if (!hasScheme && !url.port) {
    url.port = String(DEFAULT_PORT);
  }
  const path = url.pathname.replace(INTERFACE_PATH, '').replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

// Cronicle event ids: letters and digits (`emvpg2mmu03`), see `requireParams`
// of its API (`/^\w+$/`).
const EVENT_ID = /^\w{1,40}$/;

/**
 * The events typed by the user: ids separated by commas, spaces or
 * semicolons. Anything else is reported, never guessed.
 * @returns {{ ids: string[], invalid: string[] }}
 */
export function parseEventIds(raw) {
  const ids = [];
  const invalid = [];
  const text = typeof raw === 'string' ? raw : '';
  for (const part of text.split(/[\s,;]+/)) {
    if (!part) {
      continue;
    }
    if (EVENT_ID.test(part)) {
      if (!ids.includes(part)) {
        ids.push(part);
      }
    } else {
      invalid.push(part.slice(0, 20));
    }
  }
  return { ids: ids.slice(0, MAX_EVENTS), invalid };
}

const truthy = (value) => value === true || value === 'true' || value === 1 || value === '1';

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const choice = (key, list) =>
    list.includes(String(source[key])) ? String(source[key]) : DEFAULT_CONFIG[key];
  const typed = text('url');
  const apiKey = text('api_key');
  const events = parseEventIds(source.events);
  if (apiKey && events.ids.includes(apiKey)) {
    // The key pasted in the wrong field: never logged nor reported as an id.
    events.ids = events.ids.filter((id) => id !== apiKey);
    events.invalid.push('***');
  }
  return {
    // null: nothing typed, or not understood (see hub.connectionStatus).
    url: typed ? parseServerUrl(typed) : null,
    urlTyped: Boolean(typed),
    // A pasted key often carries a trailing space or new line.
    apiKey,
    // Empty: every event of the schedule (MAX_EVENTS at most).
    events: events.ids,
    invalidEvents: events.invalid,
    allowRun: truthy(source.allow_run),
    stuckMs: Number(choice('stuck_minutes', STUCK_MINUTES)) * 60_000,
    pollIntervalMs: Number(choice('poll_interval', POLL_INTERVALS)) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
