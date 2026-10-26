// -----------------------------------------------------------------------------
// The Cronicle hub: the schedule, the running jobs and the last completed jobs
// read on a timer of the container, the states of the server and of the
// followed events published when they change, the scene events fired when a
// job ends, runs too long or when Cronicle stops answering, and the commands
// (run, abort) of the scene actions and of the widget.
//
// One reading: get_schedule, get_active_jobs, get_history (last 100 jobs),
// and get_event_history once for a followed event whose last job is not in
// that history. The interval is the one of the configuration (60 s by
// default); while a job of a followed event runs, every `fastMs` (5 s), so
// its end is seen at once.
//
// Gladys never polls these devices (should_poll: false): the interval goes up
// to 5 minutes, beyond the fixed list of the core scheduler, and a job ending
// must fire its trigger for an event added to Gladys or not.
//
// What was seen is kept in /data (src/store.js): the jobs of the last history
// read, the last job of each followed event, the stuck jobs already announced
// and whether Cronicle answered — so a job that ended while the integration or
// Gladys restarted is still announced, once, and never twice.
//
// Never logged nor published: the parameters of an event (its script), the
// log of a job, the API key (Cronicle copies it into some texts: redacted by
// the client).
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import {
  buildEventDevice,
  buildServerDevice,
  durationOf,
  eventIds,
  eventValues,
  parseEventId,
  serverIds,
  serverValues,
} from './devices.js';
import { CronicleClient, CronicleError, JOB_STATUSES } from './cronicle/client.js';
import { MAX_EVENTS, hostOf, normalizeConfig } from './config.js';
import { ProblemLog } from './problems.js';
import { ACTION_TEXT, CONNECTION_TEXT, ERROR_TEXT, REPORT_TEXT, labelled, pick } from './texts.js';

const logger = createLogger({ name: 'cronicle-hub' });

export const WIDGET_KEY = 'cronicle';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  SUCCEEDED: 'job_succeeded',
  FAILED: 'job_failed',
  STUCK: 'job_stuck',
  UNREACHABLE: 'server_unreachable',
  BACK: 'server_back',
});

export const HUB_TIMINGS = {
  // Reading interval while a job of a followed event runs.
  fastMs: 5_000,
  // An unchanged value is sent again this often: Gladys shows "no recent
  // value" after 48 hours.
  heartbeatMs: 12 * 3600_000,
  // A command reads Cronicle again when the last read is older.
  freshMs: 10_000,
  // A command waits that long, at most, for the read that follows it.
  commandReadMs: 8_000,
  // "Run a Cronicle event" waits that long, at most, from its start, for the
  // end of the job: below the 120 s timeout of the action (manifest), with
  // room for the last read (10 s at most). Read every waitStepMs meanwhile.
  waitMs: 90_000,
  waitStepMs: 3_000,
};

// Completed jobs read at every cycle (newest first).
export const HISTORY_ROWS = 100;
const DAY_MS = 24 * 3600_000;
// A completed job is new when it ended after the newest one already seen,
// with this margin: Cronicle stamps the end to the millisecond, two jobs may
// end in the same instant.
const END_MARGIN_MS = 2_000;
const MAX_TRANSPORTS_PER_REQUEST = 100;
// Lines of the "Test the connection" report, at most.
const MAX_REPORT_LINES = 30;

const summary = (job) =>
  job
    ? {
        id: job.id,
        event: job.event,
        eventTitle: job.eventTitle,
        status: job.status,
        start: job.start,
        end: job.end,
        elapsed: job.elapsed,
        code: job.code,
        description: job.description,
      }
    : null;

export class CronicleHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/cronicle/client.js)
   * @param {boolean} [options.timers] the reading timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    // Defaults until start(): a handler reached after a failed start still
    // answers with a readable message.
    this.config = normalizeConfig({});
    this.client = null;
    this.signature = null;
    /** @type {Map<string, object>} followed events at the last read, by id */
    this.events = new Map();
    /** every event of the schedule (for the report) */
    this.schedule = [];
    this.runningJobs = 0;
    this.failures = 0;
    /** completed jobs of the followed events, newest first (widget) */
    this.recent = [];
    this.readAt = 0;
    this.error = null;
    this.polling = null;
    this.transports = new Map();
    this.connection = null;
    this.discovered = null;
    // Event ids whose last job was asked with get_event_history.
    this.looked = new Set();
    this.saved = this.emptySaved();
    this.pollTimer = null;
    this.timerFast = false;
    this.stopped = false;
    // What fails again at every cycle (Gladys refusing, the reading loop):
    // one line when it starts, one when it ends.
    this.problems = new ProblemLog(logger);
  }

  emptySaved() {
    // seen: job ids of the last history read; lastEnd: newest end among them;
    // lastJobs: event id → last completed job; stuck: running job ids already
    // announced as stuck; reachable: Cronicle answered at the last read
    // (null: unknown); downSince: when it stopped answering.
    return {
      url: null,
      initialized: false,
      seen: [],
      lastEnd: 0,
      lastJobs: {},
      stuck: [],
      reachable: null,
      downSince: null,
    };
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    const object = (value) =>
      value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const list = (value) =>
      Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
    this.saved = {
      url: typeof saved.url === 'string' ? saved.url : null,
      initialized: saved.initialized === true,
      seen: list(saved.seen),
      lastEnd: Number.isFinite(saved.lastEnd) ? saved.lastEnd : 0,
      lastJobs: object(saved.lastJobs),
      stuck: list(saved.stuck),
      reachable: typeof saved.reachable === 'boolean' ? saved.reachable : null,
      downSince: Number.isFinite(saved.downSince) ? saved.downSince : null,
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.gladys.forgetPublishedStates?.();
    this.transports.clear();
    this.connection = null;
    this.discovered = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    const previous = this.config;
    this.config = config;
    if (previous.language !== config.language) {
      // New names for the Discovery tab, texts in the new language.
      this.discovered = null;
      this.gladys.forgetPublishedStates?.();
    }
    if (config.invalidEvents.length > 0) {
      logger.warn(`Followed events: not understood: ${config.invalidEvents.join(' ')}`);
    }
    if (JSON.stringify(previous.events) !== JSON.stringify(config.events)) {
      // A read under way was made for the previous list: read again after it.
      await this.polling?.catch(() => {});
    }
    const signature = JSON.stringify([config.url, config.apiKey]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.client =
        config.url && config.apiKey
          ? new CronicleClient({ url: config.url, apiKey: config.apiKey, request: this.request })
          : null;
      this.events = new Map();
      this.schedule = [];
      this.recent = [];
      this.readAt = 0;
      this.error = null;
      this.polling = null;
      this.looked.clear();
      // Another instance: what was learnt about the previous one is worthless.
      if (config.url && this.saved.url && this.saved.url !== config.url) {
        this.saved = this.emptySaved();
      }
      if (config.url) {
        this.saved.url = config.url;
      }
      // A key just typed may be wrong: that is not Cronicle going down.
      this.saved.reachable = null;
      this.saved.downSince = null;
    }
    try {
      if (this.client) {
        await this.pollNow({ publish: true });
      } else {
        await this.afterChanges(true, { publish: true });
      }
    } finally {
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.store.flush();
  }

  /** Whether a job of a followed event runs: the timer reads faster. */
  busy() {
    if (this.error) {
      return false; // Cronicle does not answer: no reason to insist
    }
    return [...this.events.values()].some((event) => event.activeJob);
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.timerFast = this.busy();
    const delay = this.timerFast ? this.timings.fastMs : this.config.pollIntervalMs;
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollNow();
        this.problems.recover('poll', 'Reading Cronicle works again');
      } catch (err) {
        this.problems.fail('poll', `Poll failed: ${err.message}`, 'error');
      }
      this.schedulePoll();
    }, delay);
  }

  // --- Reading Cronicle --------------------------------------------------------

  /** Read Cronicle now and publish what changed. */
  async pollNow({ publish = false } = {}) {
    const changed = await this.poll();
    await this.afterChanges(changed, { publish });
    if (this.pollTimer && this.busy() && !this.timerFast) {
      // A job seen running by a read outside the timer (Refresh, a command):
      // the timer reads faster at once.
      this.schedulePoll();
    }
  }

  /**
   * Read after a command, so the states and the widget show it. Waited for
   * `commandReadMs` at most: a slow Cronicle does not turn a command that
   * succeeded into a scene action that timed out.
   */
  async pollAfterCommand() {
    const read = (async () => {
      await this.polling?.catch(() => {});
      await this.pollNow();
      this.schedulePoll();
    })().catch((err) => logger.debug(`Read after a command failed: ${err.message}`));
    let timer;
    const late = new Promise((resolve) => {
      timer = setTimeout(resolve, this.timings.commandReadMs);
    });
    await Promise.race([read, late]);
    clearTimeout(timer);
  }

  /** Read again when the last read is older than `freshMs`. */
  async refreshIfStale() {
    if (this.client && this.now() - this.readAt >= this.timings.freshMs) {
      await this.pollNow();
    }
  }

  /**
   * Read Cronicle and apply what changed. Concurrent calls share the read.
   * @returns {Promise<boolean>} whether the widget shows something new
   */
  poll() {
    if (!this.client) {
      return Promise.resolve(false);
    }
    if (!this.polling) {
      const polling = this.read(this.client).finally(() => {
        // A read of a previous client must not drop the promise of the current one.
        if (this.polling === polling) {
          this.polling = null;
        }
      });
      this.polling = polling;
    }
    return this.polling;
  }

  async read(client) {
    let result;
    try {
      result = await this.fetchAll(client);
    } catch (err) {
      if (!(err instanceof CronicleError)) {
        throw err;
      }
      return client === this.client && this.applyFailure(err);
    }
    return client === this.client && this.applySuccess(result);
  }

  /** The followed events of a schedule: the listed ones, or every event. */
  followedOf(schedule) {
    if (this.config.events.length === 0) {
      return schedule.slice(0, MAX_EVENTS);
    }
    const ids = new Set(this.config.events);
    return schedule.filter((event) => ids.has(event.id));
  }

  async fetchAll(client) {
    const schedule = await client.schedule();
    const active = await client.activeJobs();
    const history = await client.history(HISTORY_ROWS);
    // The last job of a followed event older than the history read: asked
    // once per event (an event that never ran stays without one).
    const older = {};
    for (const event of this.followedOf(schedule)) {
      if (
        this.looked.has(event.id) ||
        this.saved.lastJobs[event.id] ||
        history.some((job) => job.event === event.id)
      ) {
        continue;
      }
      try {
        const [last] = await client.eventHistory(event.id, 1);
        if (last) {
          older[event.id] = last;
        }
        this.looked.add(event.id);
      } catch (err) {
        if (!(err instanceof CronicleError && err.kind === 'not_found')) {
          throw err;
        }
      }
    }
    return { schedule, active, history, older };
  }

  async applySuccess({ schedule, active, history, older }) {
    const now = this.now();
    let widgetChanged = this.error !== null || this.readAt === 0;
    if (this.error) {
      logger.info('Cronicle answers again');
    }
    this.error = null;
    this.readAt = now;
    this.schedule = schedule;

    const followed = this.followedOf(schedule);
    const missing = this.config.events.filter((id) => !schedule.some((e) => e.id === id));
    if (missing.length > 0) {
      this.problems.fail(
        'missing',
        `Followed event(s) not found with this key: ${missing.join(', ')}`,
      );
    } else {
      this.problems.recover('missing', 'Every followed event is found');
    }

    const saved = this.saved;
    let dirty = false;
    const events = [];
    const followedIds = new Set(followed.map((event) => event.id));

    // Server back: announced once, with how long it was gone.
    if (saved.reachable === false && saved.initialized) {
      const downMinutes = saved.downSince ? Math.round((now - saved.downSince) / 60_000) : 0;
      events.push({ key: TRIGGERS.BACK, data: { down_minutes: Math.max(0, downMinutes) } });
      logger.info('Cronicle is reachable again');
    }
    if (saved.reachable !== true) {
      saved.reachable = true;
      saved.downSince = null;
      dirty = true;
    }

    // Jobs completed since the last read: not seen, and ended after the
    // newest one seen (a deleted job lets an older one into the window).
    const seen = new Set(saved.seen);
    const fresh = history.filter(
      (job) => !seen.has(job.id) && (job.end ?? now) >= saved.lastEnd - END_MARGIN_MS,
    );
    if (saved.initialized) {
      for (const job of [...fresh].reverse()) {
        if (followedIds.has(job.event)) {
          events.push({ job });
        }
      }
    }
    const ids = history.map((job) => job.id);
    if (JSON.stringify(ids) !== JSON.stringify(saved.seen)) {
      saved.seen = ids;
      saved.lastEnd = Math.max(saved.lastEnd, ...history.map((job) => job.end ?? 0));
      dirty = true;
    }

    // The last completed job of each followed event.
    const lastJobs = {};
    for (const event of followed) {
      const job =
        history.find((row) => row.event === event.id) ??
        older[event.id] ??
        saved.lastJobs[event.id] ??
        null;
      if (job) {
        lastJobs[event.id] = summary(job);
      }
    }
    if (JSON.stringify(lastJobs) !== JSON.stringify(saved.lastJobs)) {
      saved.lastJobs = lastJobs;
      dirty = true;
    }

    // Stuck jobs: running longer than the threshold, announced once each.
    const stuck = saved.stuck.filter((id) => active.some((job) => job.id === id));
    if (this.config.stuckMs > 0) {
      for (const job of active) {
        if (
          followedIds.has(job.event) &&
          job.start !== null &&
          now - job.start >= this.config.stuckMs &&
          !stuck.includes(job.id)
        ) {
          stuck.push(job.id);
          events.push({ stuck: job });
        }
      }
    }
    if (JSON.stringify(stuck) !== JSON.stringify(saved.stuck)) {
      saved.stuck = stuck;
      dirty = true;
    }

    // The events as shown: the newest running job, the last completed one.
    const next = new Map();
    for (const event of followed) {
      const activeJob =
        active
          .filter((job) => job.event === event.id)
          .sort((a, b) => (b.start ?? 0) - (a.start ?? 0))[0] ?? null;
      const entry = { ...event, activeJob, lastJob: lastJobs[event.id] ?? null };
      const previous = this.events.get(event.id);
      if (
        !previous ||
        previous.title !== entry.title ||
        previous.activeJob?.id !== activeJob?.id ||
        previous.lastJob?.id !== entry.lastJob?.id
      ) {
        widgetChanged = true;
      }
      next.set(event.id, entry);
    }
    if (next.size !== this.events.size) {
      widgetChanged = true;
    }
    this.events = next;
    this.runningJobs = active.length;
    this.failures = history.filter(
      (job) => job.status !== JOB_STATUSES.SUCCESS && (job.end ?? 0) >= now - DAY_MS,
    ).length;
    const recent = history.filter((job) => followedIds.has(job.event)).slice(0, 10);
    if (JSON.stringify(recent.map((j) => j.id)) !== JSON.stringify(this.recent.map((j) => j.id))) {
      widgetChanged = true;
    }
    this.recent = recent;

    if (!saved.initialized) {
      // The first read only sets what is known: no event for the past.
      saved.initialized = true;
      dirty = true;
    }
    // Written only when something changed: no wear of the SD card at every read.
    // Saved before the events: a crash in between never announces one twice.
    if (dirty) {
      await this.store.save(saved);
    }
    await this.publishStates();
    for (const event of events) {
      await this.announce(event);
    }
    return widgetChanged;
  }

  /** Fire the scene event of a completed job, a stuck job or the server. */
  async announce({ key, data, job, stuck }) {
    if (key) {
      await this.fire(key, data);
      return;
    }
    if (stuck) {
      const minutes = Math.round((this.now() - stuck.start) / 60_000);
      logger.info(`${stuck.eventTitle}: job ${stuck.id} running for ${minutes} min`);
      await this.fire(TRIGGERS.STUCK, {
        device: eventIds(this.gladys, stuck.event).device,
        event: stuck.eventTitle,
        job_id: stuck.id,
        minutes,
      });
      return;
    }
    const succeeded = job.status === JOB_STATUSES.SUCCESS;
    logger.info(`${job.eventTitle}: job ${job.id} ${succeeded ? 'succeeded' : 'failed'}`);
    const common = {
      device: eventIds(this.gladys, job.event).device,
      event: job.eventTitle,
      job_id: job.id,
      duration: durationOf(job) ?? 0,
    };
    if (succeeded) {
      await this.fire(TRIGGERS.SUCCEEDED, common);
    } else {
      await this.fire(TRIGGERS.FAILED, {
        ...common,
        code: job.code ?? 1,
        message: job.description || '-',
      });
    }
  }

  async applyFailure(err) {
    const wasError = this.error?.kind;
    const now = this.now();
    this.error = { kind: err.kind, message: err.message };
    this.readAt = now;
    if (wasError !== err.kind) {
      logger.warn(`Cronicle: ${err.message}`);
    }
    if (this.saved.reachable === true) {
      // Lost after having answered: announced once (not for a key just typed).
      this.saved.reachable = false;
      this.saved.downSince = now;
      await this.store.save(this.saved);
      await this.fire(TRIGGERS.UNREACHABLE, {
        reason: pick(ERROR_TEXT[err.kind], this.config.language),
      });
    }
    await this.publishStates();
    return wasError !== err.kind;
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
    } catch (err) {
      logger.warn(`Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------

  externalIdOf(event) {
    return eventIds(this.gladys, event.id).device;
  }

  isCreated(externalId) {
    return (this.gladys.devices ?? []).some((device) => device.external_id === externalId);
  }

  discoveredDevices() {
    if (!this.client || this.readAt === 0 || this.error) {
      return null; // nothing read: keep the list Gladys has
    }
    const language = this.config.language;
    return [
      buildServerDevice(this.gladys, hostOf(this.config.url), language),
      ...[...this.events.values()]
        .sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
        .map((event) => buildEventDevice(this.gladys, event, language)),
    ];
  }

  /** Publish the Discovery list when it changed (an event added, renamed…). */
  async publishDevices({ force = false } = {}) {
    const devices = this.discoveredDevices() ?? (this.client ? null : []);
    if (devices === null) {
      return;
    }
    const key = JSON.stringify(devices);
    if (!force && key === this.discovered) {
      return;
    }
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.discovered = key;
      this.problems.recover('discovered', 'Discovered devices accepted again');
    } catch (err) {
      this.problems.fail('discovered', `Discovered devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read Cronicle, publish the list again. */
  async rediscover() {
    await this.poll();
    await this.afterChanges(true, { publish: true });
  }

  /**
   * The user added (or updated) a device: its states sent before were dropped
   * by Gladys (the SDK forgets them: they go again).
   */
  async onDeviceCreated(device) {
    this.transports.delete(device.external_id);
    await this.publishStates();
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  /** Gladys asks for a refresh (onPoll, only if it polls anyway). */
  async pollDevice() {
    await this.pollNow();
  }

  /**
   * The states of the added devices. The SDK skips the values Gladys already
   * has (and sends an unchanged one again after `heartbeatMs`). While
   * Cronicle does not answer, only "reachable" (0) goes.
   */
  async publishStates() {
    if (this.readAt === 0 || !this.client) {
      return;
    }
    const states = [];
    if (this.isCreated(serverIds(this.gladys).device)) {
      states.push(
        ...serverValues(this.gladys, {
          reachable: !this.error,
          runningJobs: this.runningJobs,
          failures: this.failures,
        }),
      );
    }
    if (!this.error) {
      for (const event of this.events.values()) {
        if (this.isCreated(this.externalIdOf(event))) {
          states.push(...eventValues(this.gladys, event, this.config.language));
        }
      }
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.problems.recover('states', 'States accepted again');
    } catch (err) {
      this.problems.fail('states', `States refused: ${err.message}`);
    }
  }

  async afterChanges(widgetChanged, { publish = false } = {}) {
    await this.publishDevices({ force: publish });
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (widgetChanged) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  /** The badge of the added devices: local, or unreachable. */
  async publishTransports() {
    if (!this.client || this.readAt === 0) {
      return;
    }
    const transport = this.error ? DEVICE_TRANSPORTS.UNREACHABLE : DEVICE_TRANSPORTS.LOCAL;
    const entries = [];
    const externalIds = [
      serverIds(this.gladys).device,
      ...[...this.events.values()].map((event) => this.externalIdOf(event)),
    ];
    for (const externalId of externalIds) {
      if (this.isCreated(externalId) && this.transports.get(externalId) !== transport) {
        entries.push({ external_id: externalId, transport });
      }
    }
    for (let at = 0; at < entries.length; at += MAX_TRANSPORTS_PER_REQUEST) {
      const batch = entries.slice(at, at + MAX_TRANSPORTS_PER_REQUEST);
      try {
        await this.gladys.publishTransports(batch);
        for (const entry of batch) {
          this.transports.set(entry.external_id, entry.transport);
        }
        this.problems.recover('transports', 'Transports accepted again');
      } catch (err) {
        this.problems.fail('transports', `Transports refused: ${err.message}`);
      }
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config.urlTyped) {
      return { connected: false, message: CONNECTION_TEXT.noUrl };
    }
    if (!this.config.url) {
      return { connected: false, message: CONNECTION_TEXT.invalidUrl };
    }
    if (!this.config.apiKey) {
      return { connected: false, message: CONNECTION_TEXT.noKey };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.problems.recover('connection', 'Connection status accepted again');
    } catch (err) {
      this.problems.fail('connection', `Connection status refused: ${err.message}`);
    }
  }

  // --- Commands (scene actions, widget, report) --------------------------------

  /** Throws the reason Cronicle cannot answer, if any. */
  assertReadable() {
    const status = this.connectionStatus();
    if (!status.connected) {
      throw new Error(pick(status.message, this.config.language));
    }
  }

  /** An error of a command, in the language of the configuration. */
  commandError(err, language = this.config.language) {
    if (err instanceof CronicleError) {
      const text = pick(ERROR_TEXT[err.kind], language);
      return new Error(err.reason && err.kind === 'refused' ? `${text} (${err.reason})` : text);
    }
    return err;
  }

  assertRunAllowed(language = this.config.language) {
    if (!this.config.allowRun) {
      throw new Error(pick(ACTION_TEXT.runOff, language));
    }
  }

  /**
   * The followed event of an event id or a device external id — the guard of
   * every command: an event that is not followed is refused, whatever asks.
   */
  async eventOf(idOrExternalId, language = this.config.language) {
    const id =
      parseEventId(this.gladys, idOrExternalId) ??
      (typeof idOrExternalId === 'string' && /^\w{1,40}$/.test(idOrExternalId)
        ? idOrExternalId
        : null);
    if (!id) {
      throw new Error(pick(ACTION_TEXT.notFollowed, language));
    }
    this.assertReadable();
    if (!this.events.has(id)) {
      await this.refreshIfStale();
      this.assertReadable();
    }
    const event = this.events.get(id);
    if (!event) {
      const listed = this.config.events.length === 0 || this.config.events.includes(id);
      throw new Error(pick(listed ? ACTION_TEXT.notFound : ACTION_TEXT.notFollowed, language));
    }
    return event;
  }

  /**
   * Run a followed event, when running from Gladys is allowed.
   * @returns {Promise<{ ids: string[], queued: boolean }>}
   */
  async run(event, language = this.config.language) {
    // Checked right before the command: the configuration may have changed
    // while the event was being read.
    this.assertRunAllowed(language);
    let started;
    try {
      started = await this.client.run(event.id);
    } catch (err) {
      throw this.commandError(err, language);
    }
    logger.info(
      started.queued
        ? `${event.title}: run queued by Cronicle, from Gladys`
        : `${event.title}: job ${started.ids.join(', ')} started from Gladys`,
    );
    await this.pollAfterCommand();
    return started;
  }

  /** One job, read now (scene action waiting for the end). */
  async job(jobId, language = this.config.language) {
    try {
      return await this.client.job(jobId);
    } catch (err) {
      throw this.commandError(err, language);
    }
  }

  /**
   * Abort the running job of a followed event.
   * @returns {Promise<object|null>} the job aborted, null when none ran
   */
  async abort(event, language = this.config.language) {
    this.assertRunAllowed(language);
    // A fresh read: the job may have been started outside Gladys a moment ago.
    await this.pollNow();
    const job = this.events.get(event.id)?.activeJob;
    if (!job) {
      return null;
    }
    try {
      await this.client.abort(job.id);
    } catch (err) {
      throw this.commandError(err, language);
    }
    logger.info(`${event.title}: job ${job.id} abort requested from Gladys`);
    await this.pollAfterCommand();
    return job;
  }

  /**
   * "Test the connection": every event the key sees, with its id, the
   * followed ones marked — the ids to copy into the list.
   */
  async testConnection() {
    await this.pollNow({ publish: true });
    const status = this.connectionStatus();
    if (!status.connected) {
      return status.message;
    }
    const all = [...this.schedule].sort((a, b) => a.title.localeCompare(b.title));
    const followed = new Set(this.events.keys());
    const missing = this.config.events.filter((id) => !all.some((e) => e.id === id));
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      const lines = [`${text.ok} (${hostOf(this.config.url)})`];
      if (all.length === 0) {
        lines.push(text.none);
      } else {
        lines.push(text.visible);
        for (const event of all.slice(0, MAX_REPORT_LINES)) {
          const mark = followed.has(event.id) ? ` ✓ ${text.followed}` : '';
          lines.push(`${labelled(event.id, event.title, language)}${mark}`);
        }
        if (all.length > MAX_REPORT_LINES) {
          lines.push(`… +${all.length - MAX_REPORT_LINES}`);
        }
      }
      if (missing.length > 0) {
        lines.push(text.missing(missing.join(', ')));
      }
      if (this.config.invalidEvents.length > 0) {
        lines.push(text.invalid(this.config.invalidEvents.join(' ')));
      }
      lines.push(this.config.allowRun ? text.runOn : text.runOff);
      message[language] = lines.join('\n');
    }
    return message;
  }
}
