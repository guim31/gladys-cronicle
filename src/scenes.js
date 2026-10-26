// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// "Run a Cronicle event": runs a followed event — only when running from
// Gladys is allowed in the configuration (off by default) — and optionally
// waits for its end (up to `waitMs` of the hub timings, within the 120 s the
// core grants a scene action) so the next actions know whether it succeeded.
// A longer job goes on in Cronicle: the "job succeeded / failed" triggers
// report its end.
//
// "Read a Cronicle event": the state of a followed event (running, last
// result, its message and duration), for a condition in a scene.
//
// "Abort a Cronicle job": aborts the running job of a followed event, if any
// (same switch as running).
//
// The event is chosen among the devices of the integration (added in Gladys),
// and checked against the followed events again here.
// -----------------------------------------------------------------------------

import { JOB_STATUSES } from './cronicle/client.js';
import { currentJob, durationOf, isRunning, statusOf } from './devices.js';
import { ERROR_TEXT, STATUS_TEXT, formatTime, pick } from './texts.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The outputs of "Run a Cronicle event", for a job as last seen. */
function runOutputs(job, { queued = false } = {}, language) {
  return {
    job_id: job?.id ?? '',
    queued,
    finished: Boolean(job) && !isRunning(job),
    success: job?.status === JOB_STATUSES.SUCCESS,
    status: pick(STATUS_TEXT[job ? statusOf(job) : 'never'], language),
    code: job?.code ?? 0,
    message: job?.description || '',
    duration: durationOf(job) ?? 0,
  };
}

export const SCENE_ACTIONS = {
  async run_event(hub, { fields = {} }) {
    const { waitMs, waitStepMs: stepMs } = hub.timings;
    // Counted from the start of the action: the run and its read are on the
    // same budget as the wait (the core cuts the action at its timeout).
    const deadline = Date.now() + waitMs;
    const language = hub.config.language;
    hub.assertRunAllowed(language);
    const event = await hub.eventOf(fields.device);
    if (Date.now() >= deadline) {
      // Cronicle was too slow to answer: better not run than run twice
      // (the core would report a timeout, and the scene could be run again).
      throw new Error(pick(ERROR_TEXT.timeout, language));
    }
    const started = await hub.run(event);
    if (started.queued) {
      return runOutputs(null, { queued: true }, language);
    }
    const jobId = started.ids[0];
    let job = { id: jobId, status: JOB_STATUSES.RUNNING, code: null, description: '' };
    if (fields.wait === true || fields.wait === 'true') {
      while (isRunning(job) && Date.now() + stepMs <= deadline) {
        await sleep(stepMs);
        try {
          job = await hub.job(jobId);
        } catch {
          break; // the job goes on in Cronicle: "not finished" is the truth we know
        }
      }
      if (!isRunning(job)) {
        // The states and the triggers follow at once, without holding the scene.
        hub.pollNow().catch(() => {});
      }
    }
    return runOutputs(job, {}, language);
  },

  async get_event(hub, { fields = {} }) {
    const language = hub.config.language;
    await hub.refreshIfStale();
    const event = await hub.eventOf(fields.device);
    const current = currentJob(event);
    const last = event.lastJob;
    return {
      status: pick(STATUS_TEXT[statusOf(current)], language),
      running: Boolean(event.activeJob),
      success: last?.status === JOB_STATUSES.SUCCESS,
      code: last?.code ?? 0,
      message: last?.description || '',
      duration: durationOf(last) ?? 0,
      last_run: current?.start ? formatTime(current.start, language) : '',
      enabled: event.enabled,
    };
  },

  async abort_job(hub, { fields = {} }) {
    hub.assertRunAllowed();
    const event = await hub.eventOf(fields.device);
    const job = await hub.abort(event);
    return { aborted: job !== null, job_id: job?.id ?? '' };
  },
};
