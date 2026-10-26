# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- the **Cronicle API key**, stored by Gladys in the integration configuration
  (never written to `/data`, never logged); it is only sent, in the
  `X-API-Key` header (never in a URL), to the configured address, and
  redirects are not followed so it never reaches another host. Cronicle copies
  the key into some of its texts ("Invalid API Key: …", the message of a job
  aborted by API): every text read from Cronicle is redacted before it is
  logged, stored or published;
- **running and aborting events**: off until "Allow Gladys to run and abort the
  followed events" is turned on, and limited to the followed events, checked
  again at every command (scene action or widget button). Widget buttons ask
  for a confirmation; the devices carry no command. The privileges of the key
  (Run events, Abort jobs) are a second barrier;
- the **parameters of the events** (scripts, URLs, which may hold secrets) and
  the **log of the jobs** are never read into the integration's state nor
  logged; only the title of an event, and the status, dates, exit code, error
  message and duration of a job are kept;
- `/data/cronicle-state.json`: the ids of the last completed jobs, the last job
  of each followed event (status, dates, code, message), the stuck jobs already
  announced, whether Cronicle answered, and the address of Cronicle;
- network: HTTP(S) requests to the Cronicle address, nothing else; no port is
  opened.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Cronicle itself.
