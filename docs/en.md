# Cronicle

[Cronicle](https://github.com/jhuckaby/Cronicle) is an open-source,
self-hosted task scheduler with a web interface: each "event" is a job (a
shell script, an HTTP request…) that runs on a schedule or on demand, on one
server or many. This integration brings Cronicle into Gladys: the server and
each followed event become devices with the result of the last job, scenes can
react when a job **succeeds**, **fails** or is **stuck**, or when Cronicle
**stops answering**, a scene can **run an event** (and wait for its end),
**read** its last result or **abort** its job, and a dashboard widget shows
the last runs.

Tested against a real Cronicle 0.9.80 (Docker, events that succeed, fail and
run long, run by the API and by the schedule); not against a real Gladys
instance yet: feedback welcome on
[the issues](https://github.com/guim31/gladys-cronicle/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- Cronicle 0.9.x, its primary server reachable from the Gladys machine.
- A Cronicle API key. Reading needs no privilege. Running and aborting from
  Gladys need the **Run events** and **Abort jobs** privileges of the key.

Running an event runs code on your servers. That is why nothing can be run
from Gladys until you turn **Allow Gladys to run and abort the followed events**
on, and why the integration never reads the log of a job nor the script of an
event (they may hold secrets): only the status, the exit code, the error
message and the duration.

At each refresh (one minute by default) the integration reads the schedule,
the running jobs and the last 100 completed jobs; every 5 seconds while a job
of a followed event runs. Cronicle sets no rate limit on its API.

## Getting started

### 1. Create an API key

In Cronicle, open **Admin → API Keys → Add API Key**. Give it a title
("Gladys"); leave every privilege off for a read-only use, or tick **Run
events** and **Abort jobs** to run and abort events from Gladys.

### 2. Configure the integration

In Gladys, **Integrations → Cronicle → Configuration**:

- **Cronicle address**: the address of the primary server, e.g.
  `http://192.168.1.2:3012` (port 3012 is added to a bare IP address). A
  secondary server redirects to the primary: type the primary.
- **API key**: the key of step 1.
- **Language of the names**: French by default; it sets the feature names when
  a device is added, the statuses and the scene results.

Save, then click **Test the connection**: it lists every event the key sees,
with its id, e.g. `emvpg2mmu03: Nightly backup ✓ followed`.

### 3. Choose the events

Every event is followed by default (50 at most). To follow only some, type
their ids in **Followed events (ids)**, separated by commas. To run or abort
them from Gladys, turn **Allow Gladys to run and abort the followed events** on.
In **Options**, **A job is stuck after** sets the threshold of the stuck
trigger (1 hour by default, or never).

### 4. Add the devices

In the **Discover** tab, add the server and the events you want as devices.
The triggers, the actions and the widget work for every followed event; the
devices bring the states and the history.

## The devices

**Cronicle** (the server):

| Feature         | Meaning                                                           |
| --------------- | ----------------------------------------------------------------- |
| Reachable       | 1 while Cronicle answers                                          |
| Running jobs    | jobs running now, every event                                     |
| Failures (24 h) | failed or aborted jobs ended in the last 24 hours (last 100 jobs) |

One device per followed event, named after it:

| Feature            | Meaning                                                                  |
| ------------------ | ------------------------------------------------------------------------ |
| Last job           | status of the last job: Succeeded, Failed, Aborted, Running, Never run   |
| Last job succeeded | 1 when the last completed job ended with code 0                          |
| Running            | 1 while a job of the event runs                                          |
| Last run           | when the last job started (day/month hours:minutes, time zone of Gladys) |
| Last job duration  | duration of the last completed job, in seconds                           |

There is no command on the devices: running a job on servers is not a switch a
voice assistant or a misplaced tap should reach. An event is run from a scene
or from the widget, which asks for a confirmation.

## Dashboard

The **Cronicle last runs** widget lists the last jobs of the followed events
(or of the events chosen in its settings), running ones first, then the
completed ones, newest first: status, when it started, how long it took.
When running is allowed, each event chosen in the settings (three at most) gets
a button: **Run**, or **Abort** while a job runs. Gladys asks for a
confirmation before sending it. **Refresh** reads Cronicle again.

## Scenes

### Triggers

- **A Cronicle job succeeds**: a job of a followed event ends with code 0.
  Variables: event name, duration (s), job id.
- **A Cronicle job fails**: a job of a followed event ends with another code or
  is aborted (by hand, timeout, server lost). Variables: event name, error
  message (e.g. `Script exited with code: 3: disk full`), exit code, duration
  (s), job id.
- **A Cronicle job is stuck**: a job of a followed event runs longer than the
  threshold of the configuration, once per job. Variables: event name, running
  for (min), job id.
- **Cronicle stops answering**: Cronicle answered at the previous read and no
  longer does, once. Variable: the reason.
- **Cronicle answers again**: after it stopped answering. Variable: how long it
  was gone (min).

The job triggers can be limited to some events. Jobs started by the schedule,
by hand in Cronicle or by another tool count too. The first reading after the
installation announces nothing from the past; a job that ended while Gladys or
the integration restarted is announced once.

### Actions

- **Run a Cronicle event**: runs a followed event, when running is allowed.
  With **Wait for the end (90 s at most)**, the scene waits for the job and
  the next actions get its result. Outputs: job id, queued by Cronicle (an event with a queue, already running), finished, succeeded, status, exit code, error
  message, duration (s).
- **Read a Cronicle event**: the state of a followed event, for a condition.
  Outputs: status, running, last job succeeded, exit code, error message,
  duration (s), last run, event enabled.
- **Abort a Cronicle job**: aborts the running job of a followed event, when
  running is allowed. Outputs: a job was aborted (yes/no), job id.

They refuse an event that is no longer followed, even if its device still
exists in Gladys.

### Scene ideas

- When **A Cronicle job fails** for "Nightly backup", send a Telegram message:
  "{{triggerEvent.data.event}} failed: {{triggerEvent.data.message}}".
- When **A Cronicle job is stuck**, turn the hallway light orange.
- When you leave home, **Run a Cronicle event** "Sync photos" with **Wait for
  the end**, then notify you only if "Succeeded" is false.

## Troubleshooting

- **API key refused or disabled**: the key was deleted, disabled or mistyped;
  check it in Admin → API Keys.
- **The API key lacks the privilege**: tick **Run events** (and **Abort jobs**)
  on the key.
- **Running events from Gladys is off**: turn **Allow Gladys to run and abort the
  followed events** on in the configuration.
- **Followed but not found**: the id is wrong or the event was deleted. **Test
  the connection** lists what the key sees.
- **No Cronicle API at this address**: check the address and the port; behind
  a reverse proxy, include its path.
- **The address redirects**: type the `https://` address, or the address of
  the primary server.
- A job does not show up at once: the integration reads Cronicle every minute
  (configurable), every 5 seconds while a job runs.

## Limits

- The last 100 completed jobs are read at each refresh: on a very busy
  Cronicle (more than 100 jobs between two readings), some ends may be missed,
  and **Failures (24 h)** counts within those 100 jobs only.
- The log of the jobs is never read nor shown, by design; the error message is
  the one Cronicle shows in its history (any API key in it is hidden).
- "Wait for the end" waits 90 s at most (the limit of a scene action in
  Gladys); a longer job goes on, and the triggers report its end.
- An event already running as many jobs as it may is refused by Cronicle (its reason is shown), or queued when the event has a queue: the action then says "queued", without a job id.
- Developed and tested against Cronicle 0.9.80; other 0.9.x versions should
  work (same API), untested. Not affiliated with Cronicle or its author.
