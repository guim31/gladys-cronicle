// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `cronicle`.
//
// The use case: from the wall tablet, see whether the last jobs went well
// without opening Cronicle, and start one of a few events (a backup, an
// update) when running from Gladys is allowed. So the widget shows the last
// executions — running jobs first, then the completed ones, newest first —
// each with its status, when it started and how long it took; then, for the
// events chosen in the widget settings (three at most), a button: "Run", or
// "Abort" while a job runs. Every such button asks for a confirmation first
// (`confirm`): a tap runs a job on servers.
//
// Every followed event by default, or the ones chosen in the widget settings
// (devices added to Gladys). The figures are sent as values, not bound to
// device features: the widget works before the devices are added.
//
// Budget (8 components, 2 texts, 4 buttons): one text when Cronicle does not
// answer or nothing ran, one status list, three run/abort buttons, Refresh.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { JOB_STATUSES } from './cronicle/client.js';
import { durationOf, parseEventId, statusOf } from './devices.js';
import { WIDGET_KEY } from './hub.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  STATUS_TEXT,
  formatDuration,
  formatTime,
  pick,
} from './texts.js';

export const ACTIONS = Object.freeze({ REFRESH: 'refresh', RUN: 'run', ABORT: 'abort' });

export const MAX_ROWS = 8;
// The core keeps 4 buttons per widget: three events and Refresh.
export const MAX_BUTTONS = 3;

export const TEXT = {
  nothing: {
    en: 'No job of the followed events in the recent history of Cronicle.',
    fr: "Aucune tâche des événements suivis dans l'historique récent de Cronicle.",
    de: 'Kein Job der verfolgten Ereignisse im jüngsten Verlauf von Cronicle.',
    es: 'Ninguna tarea de los eventos seguidos en el historial reciente de Cronicle.',
  },
  run: { en: 'Run', fr: 'Lancer', de: 'Starten', es: 'Lanzar' },
  abort: { en: 'Abort', fr: 'Interrompre', de: 'Abbrechen', es: 'Interrumpir' },
  refresh: { en: 'Refresh', fr: 'Actualiser', de: 'Aktualisieren', es: 'Actualizar' },
  refreshed: {
    en: 'Cronicle read again.',
    fr: 'Cronicle relu.',
    de: 'Cronicle neu gelesen.',
    es: 'Cronicle leído de nuevo.',
  },
};

const ROW_STYLE = {
  [JOB_STATUSES.RUNNING]: { icon: 'play-circle', color: WIDGET_COLORS.INFO },
  [JOB_STATUSES.SUCCESS]: { icon: 'check-circle', color: WIDGET_COLORS.SUCCESS },
  [JOB_STATUSES.ERROR]: { icon: 'x-circle', color: WIDGET_COLORS.DANGER },
  [JOB_STATUSES.ABORTED]: { icon: 'slash', color: WIDGET_COLORS.WARNING },
  unknown: { icon: 'circle', color: WIDGET_COLORS.NEUTRAL },
};

const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: pick(text, language) }],
  };
}

/** The event ids the widget shows: the chosen devices, or null for every followed one. */
export function chosenEvents(hub, settings) {
  const chosen = [settings?.events ?? []]
    .flat()
    .map((externalId) => parseEventId(hub.gladys, externalId))
    .filter(Boolean);
  return chosen.length > 0 ? new Set(chosen) : null;
}

/** The rows: running jobs first, then the completed ones, newest first. */
export function lastExecutions(hub, chosen) {
  const keep = (eventId) => !chosen || chosen.has(eventId);
  const running = [...hub.events.values()]
    .filter((event) => event.activeJob && keep(event.id))
    .map((event) => event.activeJob)
    .sort((a, b) => (b.start ?? 0) - (a.start ?? 0));
  const done = hub.recent.filter((job) => keep(job.event));
  return [...running, ...done];
}

function rowValue(job, language) {
  const parts = [pick(STATUS_TEXT[statusOf(job)], language)];
  if (job.start) {
    parts.push(formatTime(job.start, language));
  }
  const duration = durationOf(job);
  if (duration !== null) {
    parts.push(formatDuration(duration));
  }
  return parts.join(' · ');
}

async function get(hub, { settings, language = 'en' }) {
  const status = hub.connectionStatus();
  if (!hub.client) {
    return message(status.message ?? CONNECTION_TEXT.noKey, language);
  }
  const chosen = chosenEvents(hub, settings);
  const components = [];
  if (hub.error) {
    components.push({
      type: 'text',
      variant: 'body',
      text: pick(ERROR_TEXT[hub.error.kind], language),
    });
  }

  const rows = lastExecutions(hub, chosen).slice(0, MAX_ROWS);
  if (rows.length > 0) {
    components.push({
      type: 'status',
      items: rows.map((job) => ({
        label: fit(job.eventTitle, 40),
        value: fit(rowValue(job, language), 40),
        ...(ROW_STYLE[job.status] ?? ROW_STYLE.unknown),
      })),
    });
  } else if (!hub.error && hub.readAt > 0) {
    components.push({ type: 'text', variant: 'body', text: pick(TEXT.nothing, language) });
  }

  // One button per chosen event (three at most), when running is allowed:
  // Abort while a job runs, Run otherwise. The event id travels in the
  // params; the key is unique (the core drops a button whose key is taken).
  if (!hub.error && hub.config.allowRun && chosen) {
    const events = [...hub.events.values()]
      .filter((event) => chosen.has(event.id))
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, MAX_BUTTONS);
    for (const event of events) {
      const running = Boolean(event.activeJob);
      const verb = running ? ACTIONS.ABORT : ACTIONS.RUN;
      components.push({
        type: 'button',
        label: fit(`${pick(TEXT[verb], language)} ${event.title}`, 24),
        icon: running ? 'square' : 'play',
        style: running ? 'danger' : 'secondary',
        action: { key: `${verb}_${event.id}`, params: { event: event.id }, confirm: true },
      });
    }
  }

  components.push({
    type: 'button',
    label: pick(TEXT.refresh, language),
    icon: 'refresh-cw',
    style: 'secondary',
    action: { key: ACTIONS.REFRESH },
  });

  // A job running moves: refresh sooner.
  const moving = hub.error || rows.some((job) => job.status === JOB_STATUSES.RUNNING);
  return { ttl_seconds: moving ? 10 : 60, components };
}

async function action(hub, { actionKey, params = {}, settings, language }) {
  const lang = language ?? hub.config.language;
  if (actionKey === ACTIONS.REFRESH) {
    await hub.pollNow();
    return { message: hub.error ? ERROR_TEXT[hub.error.kind] : TEXT.refreshed };
  }
  const match = /^(run|abort)_(\w{1,40})$/.exec(actionKey ?? '');
  if (!match || match[2] !== params.event) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  // The switch and the followed events are checked again here: the content
  // may predate a change of the configuration.
  hub.assertRunAllowed(lang);
  // Only the events chosen in the settings carry a button.
  const chosen = settings ? chosenEvents(hub, settings) : null;
  if (settings && !chosen?.has(match[2])) {
    throw new Error(`Unknown action ${actionKey}`);
  }
  const event = await hub.eventOf(match[2], lang);
  if (match[1] === ACTIONS.RUN) {
    const started = await hub.run(event, lang);
    return { message: started.queued ? ACTION_TEXT.queued : ACTION_TEXT.launched };
  }
  const aborted = await hub.abort(event, lang);
  return { message: aborted ? ACTION_TEXT.abortRequested : ACTION_TEXT.nothingRunning };
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
