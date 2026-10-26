// -----------------------------------------------------------------------------
// Gladys devices, proposed in the Discovery tab:
//
// The Cronicle server (one per integration):
//   reachable     input/binary            1 while Cronicle answers
//   running_jobs  counter-sensor/integer  jobs running now, every event
//   failures_24h  counter-sensor/integer  failed jobs ended in the last 24 h
//                                         (among the last 100 completed jobs)
//
// One per followed event, identified by its Cronicle event id:
//   status     text/text         status of the last job: "Succeeded",
//                                "Failed", "Running"… (configuration language)
//   succeeded  input/binary      1 when the last completed job succeeded
//                                (input/binary is green at 1)
//   running    input/binary      1 while a job of the event runs
//   last_run   text/text         start of the last job, day/month hh:mm
//   duration   duration/decimal  of the last completed job, in seconds
//
// No command: running a job on servers is not a switch a voice assistant or a
// misplaced tap should reach. An event is run from a scene action or from the
// widget button (which asks for confirmation), and only when allowed.
//
// Published with should_poll: false: the integration reads Cronicle on its
// own timer (src/hub.js).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';
import { JOB_STATUSES } from './cronicle/client.js';
import { STATUS_TEXT, formatTime, pick } from './texts.js';

export const EVENT_TYPE = 'event';
export const SERVER_TYPE = 'server';
// One Cronicle per integration: the server device has a fixed id.
export const SERVER_ID = 'primary';
export const MODEL = 'Cronicle';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  STATUS: 'status',
  SUCCEEDED: 'succeeded',
  RUNNING: 'running',
  LAST_RUN: 'last_run',
  DURATION: 'duration',
});

export const SERVER_KEYS = Object.freeze({
  REACHABLE: 'reachable',
  RUNNING_JOBS: 'running_jobs',
  FAILURES: 'failures_24h',
});

// Feature names, in the language chosen in the configuration (Gladys does not
// tell a device integration the user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [FEATURE_KEYS.STATUS]: 'Last job',
    [FEATURE_KEYS.SUCCEEDED]: 'Last job succeeded',
    [FEATURE_KEYS.RUNNING]: 'Running',
    [FEATURE_KEYS.LAST_RUN]: 'Last run',
    [FEATURE_KEYS.DURATION]: 'Last job duration',
    [SERVER_KEYS.REACHABLE]: 'Reachable',
    [SERVER_KEYS.RUNNING_JOBS]: 'Running jobs',
    [SERVER_KEYS.FAILURES]: 'Failures (24 h)',
  },
  fr: {
    [FEATURE_KEYS.STATUS]: 'Dernière tâche',
    [FEATURE_KEYS.SUCCEEDED]: 'Dernière tâche réussie',
    [FEATURE_KEYS.RUNNING]: 'En cours',
    [FEATURE_KEYS.LAST_RUN]: 'Dernier lancement',
    [FEATURE_KEYS.DURATION]: 'Durée de la dernière tâche',
    [SERVER_KEYS.REACHABLE]: 'Joignable',
    [SERVER_KEYS.RUNNING_JOBS]: 'Tâches en cours',
    [SERVER_KEYS.FAILURES]: 'Échecs (24 h)',
  },
  de: {
    [FEATURE_KEYS.STATUS]: 'Letzter Job',
    [FEATURE_KEYS.SUCCEEDED]: 'Letzter Job erfolgreich',
    [FEATURE_KEYS.RUNNING]: 'Läuft',
    [FEATURE_KEYS.LAST_RUN]: 'Letzter Start',
    [FEATURE_KEYS.DURATION]: 'Dauer des letzten Jobs',
    [SERVER_KEYS.REACHABLE]: 'Erreichbar',
    [SERVER_KEYS.RUNNING_JOBS]: 'Laufende Jobs',
    [SERVER_KEYS.FAILURES]: 'Fehlschläge (24 h)',
  },
  es: {
    [FEATURE_KEYS.STATUS]: 'Última tarea',
    [FEATURE_KEYS.SUCCEEDED]: 'Última tarea correcta',
    [FEATURE_KEYS.RUNNING]: 'En ejecución',
    [FEATURE_KEYS.LAST_RUN]: 'Último inicio',
    [FEATURE_KEYS.DURATION]: 'Duración de la última tarea',
    [SERVER_KEYS.REACHABLE]: 'Accesible',
    [SERVER_KEYS.RUNNING_JOBS]: 'Tareas en curso',
    [SERVER_KEYS.FAILURES]: 'Fallos (24 h)',
  },
};

// Display bounds (the core never applies them on write).
export const MAX_DURATION_S = 7 * 24 * 3600;
export const MAX_COUNT = 1000;

export const isRunning = (job) => Boolean(job && job.status === JOB_STATUSES.RUNNING);

/** Duration of a completed job in seconds (0.1 s), null when unknown. */
export function durationOf(job) {
  if (!job || isRunning(job) || job.elapsed === null || job.elapsed === undefined) {
    return null;
  }
  return job.elapsed;
}

/** The job shown for an event: the running one, else the last completed. */
export const currentJob = (event) => event.activeJob ?? event.lastJob ?? null;

export const statusOf = (job) =>
  job ? (STATUS_TEXT[job.status] ? job.status : 'unknown') : 'never';

export const eventIds = (gladys, id) => gladys.externalIds(EVENT_TYPE, id);
export const serverIds = (gladys) => gladys.externalIds(SERVER_TYPE, SERVER_ID);

/** The event id of a device external id, null when it is not an event of ours. */
export function parseEventId(gladys, externalId) {
  const prefix = eventIds(gladys, '').device;
  if (typeof externalId !== 'string' || !externalId.startsWith(prefix)) {
    return null;
  }
  const id = externalId.slice(prefix.length);
  return /^\w{1,40}$/.test(id) ? id : null;
}

const sensor = (name, externalId, category, type, extra) => ({
  name,
  external_id: externalId,
  category,
  type,
  read_only: true,
  has_feedback: false,
  ...extra,
});

const text = (name, externalId) =>
  sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, {
    keep_history: false,
    min: 0,
    max: 0,
  });

const binary = (name, externalId) =>
  sensor(name, externalId, DEVICE_FEATURE_CATEGORIES.INPUT, DEVICE_FEATURE_TYPES.SENSOR.BINARY, {
    keep_history: true,
    min: 0,
    max: 1,
  });

const counter = (name, externalId) =>
  sensor(
    name,
    externalId,
    DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR,
    DEVICE_FEATURE_TYPES.SENSOR.INTEGER,
    { keep_history: true, min: 0, max: MAX_COUNT },
  );

/** The discovery payload of the Cronicle server. */
export function buildServerDevice(gladys, host, language = 'en') {
  const ids = serverIds(gladys);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: 'Cronicle',
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params: [{ name: 'HOST', value: host.slice(0, 255) }],
    features: [
      binary(names[SERVER_KEYS.REACHABLE], ids.feature(SERVER_KEYS.REACHABLE)),
      counter(names[SERVER_KEYS.RUNNING_JOBS], ids.feature(SERVER_KEYS.RUNNING_JOBS)),
      counter(names[SERVER_KEYS.FAILURES], ids.feature(SERVER_KEYS.FAILURES)),
    ],
  };
}

/** The values of the server device. */
export function serverValues(gladys, { reachable, runningJobs, failures }) {
  const ids = serverIds(gladys);
  const values = [{ key: SERVER_KEYS.REACHABLE, state: reachable ? 1 : 0 }];
  if (reachable) {
    values.push(
      { key: SERVER_KEYS.RUNNING_JOBS, state: Math.min(runningJobs, MAX_COUNT) },
      { key: SERVER_KEYS.FAILURES, state: Math.min(failures, MAX_COUNT) },
    );
  }
  return values.map(({ key, ...value }) => ({
    device_feature_external_id: ids.feature(key),
    ...value,
  }));
}

/**
 * The discovery payload of an event.
 * @param {object} event normalized (src/cronicle/client.js)
 * @param {string} [language]
 */
export function buildEventDevice(gladys, event, language = 'en') {
  const ids = eventIds(gladys, event.id);
  const names = NAMES[language] ?? NAMES.en;
  return {
    name: event.title,
    external_id: ids.device,
    model: MODEL,
    should_poll: false,
    params: [{ name: 'EVENT_ID', value: event.id }],
    features: [
      text(names[FEATURE_KEYS.STATUS], ids.feature(FEATURE_KEYS.STATUS)),
      binary(names[FEATURE_KEYS.SUCCEEDED], ids.feature(FEATURE_KEYS.SUCCEEDED)),
      binary(names[FEATURE_KEYS.RUNNING], ids.feature(FEATURE_KEYS.RUNNING)),
      text(names[FEATURE_KEYS.LAST_RUN], ids.feature(FEATURE_KEYS.LAST_RUN)),
      sensor(
        names[FEATURE_KEYS.DURATION],
        ids.feature(FEATURE_KEYS.DURATION),
        DEVICE_FEATURE_CATEGORIES.DURATION,
        DEVICE_FEATURE_TYPES.DURATION.DECIMAL,
        { unit: DEVICE_FEATURE_UNITS.SECONDS, keep_history: true, min: 0, max: MAX_DURATION_S },
      ),
    ],
  };
}

/**
 * The value of every feature of an event: `{ device_feature_external_id,
 * state|text }`, nothing for a value that is not known.
 * @param {object} event with `activeJob` (running, or null) and `lastJob`
 *   (the last completed one, or null)
 */
export function eventValues(gladys, event, language) {
  const ids = eventIds(gladys, event.id);
  const current = currentJob(event);
  const last = event.lastJob;
  const values = [
    { key: FEATURE_KEYS.STATUS, text: pick(STATUS_TEXT[statusOf(current)], language) },
    { key: FEATURE_KEYS.RUNNING, state: event.activeJob ? 1 : 0 },
  ];
  if (last) {
    values.push({
      key: FEATURE_KEYS.SUCCEEDED,
      state: last.status === JOB_STATUSES.SUCCESS ? 1 : 0,
    });
  }
  if (current?.start) {
    values.push({ key: FEATURE_KEYS.LAST_RUN, text: formatTime(current.start, language) });
  }
  const duration = durationOf(last);
  if (duration !== null) {
    values.push({ key: FEATURE_KEYS.DURATION, state: duration });
  }
  return values.map(({ key, ...value }) => ({
    device_feature_external_id: ids.feature(key),
    ...value,
  }));
}
