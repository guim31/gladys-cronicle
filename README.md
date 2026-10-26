# Cronicle for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that follows the jobs of a self-hosted
[Cronicle](https://github.com/jhuckaby/Cronicle) (multi-server task scheduler
with a web UI), fires scene triggers when they succeed, fail or get stuck, and
runs Cronicle events from Gladys scenes.

- **A server device**: reachable, running jobs, failures of the last 24 hours.
- **One device per followed event** (every event by default, or a list of
  ids): status of the last job (succeeded, failed, aborted, running…), last job
  succeeded, running, last run and its duration. No command on the devices: no
  voice assistant nor misplaced tap runs a job.
- **Scene triggers**: a Cronicle job succeeds, a Cronicle job fails (exit code
  and error message), a Cronicle job is stuck (longer than a threshold),
  Cronicle stops answering, Cronicle answers again — for jobs started by the
  schedule, by hand, from Gladys or anything else.
- **Scene actions**: run a Cronicle event and optionally wait for its end (90 s
  at most) to use its result; read a Cronicle event (for a condition); abort a
  Cronicle job. Running and aborting are **off until you allow them** in the
  configuration (and need the Run events / Abort jobs privileges of the key).
- **Dashboard widget**: the last runs of the followed events, running ones
  first, with Run (or Abort) buttons for up to three chosen events, confirmed
  before they are sent.
- The log of the jobs and the scripts of the events are never read: only
  status, dates, exit code, error message and duration.
- Texts in English, French, German and Spanish.

Tested against a real Cronicle 0.9.80 (Docker): API keys with and without
privileges, events that succeed, fail and run long, run by the schedule and by
the API, waited for and aborted from the integration. Not tested yet on a real
Gladys instance: feedback welcome on
[the issues](https://github.com/guim31/gladys-cronicle/issues).

## Requirements

- Gladys Assistant 5.1.0 or later.
- Cronicle 0.9.x, its primary server reachable from the Gladys machine, and an
  API key (Admin → API Keys).

## Installation

In Gladys, open **Integrations → Install from GitHub** and enter
`https://github.com/guim31/gladys-cronicle`. Then open its configuration,
enter the address of the Cronicle primary server and the API key, click
**Test the connection** to list the events with their ids, and add the server
and the events from the Discover tab.

The full guide: [docs/en.md](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

At the chosen interval (one minute by default; every 5 seconds while a job of
a followed event runs) the container reads the API of Cronicle
(`/api/app/get_schedule`, `get_active_jobs`, `get_history`) with the key in
the `X-API-Key` header. It publishes the states of the devices added to Gladys
when they change and fires the job triggers once per completed job. The jobs
seen are kept in `/data`, so a job that ended during a restart is announced
once. Every command checks the switch and the followed events again.
Redirects are not followed, so the key never reaches another host, and the
texts where Cronicle copies the key are redacted.

## Limits

- One Cronicle (its primary server) per configuration.
- The last 100 completed jobs are read at each refresh: more than 100 jobs
  between two readings may miss some ends.
- Waiting for the end of a job lasts 90 s at most (a scene action of Gladys is
  cut at 120 s); the triggers report the end of longer jobs.
- The events themselves (schedule, script, targets) are managed in Cronicle,
  not from Gladys.
- A self-signed HTTPS certificate is not accepted (use `http://` on the local
  network).

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

See [CLAUDE.md](CLAUDE.md) for the project rules and the notes on the
Cronicle API.

## Credits

- [Cronicle](https://github.com/jhuckaby/Cronicle) by Joseph Huckaby (MIT):
  this integration only talks to its API; the answers in
  `test/fixtures/cronicle` come from a real Cronicle 0.9.80 (Docker image
  `soulteary/cronicle`). The cover shows its logo,
  `htdocs/images/logo-1024.png` of its repository (MIT).
- Built from the official
  [Gladys integration template](https://github.com/GladysAssistant/integration-template-js)
  and on the architecture of
  [gladys-semaphore](https://github.com/guim31/gladys-semaphore).

Not affiliated with Cronicle or its author.

## License

Apache-2.0, see [LICENSE](LICENSE).
