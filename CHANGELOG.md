# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

### Added

- A Cronicle server device: reachable, running jobs, failures of the last 24
  hours.
- One device per followed Cronicle event (every event by default, or a list of
  ids): status of the last job, last job succeeded, running, last run and
  duration of the last job.
- Scene triggers: a Cronicle job succeeds, a Cronicle job fails (with its exit
  code and error message), a Cronicle job is stuck (longer than a threshold),
  Cronicle stops answering, Cronicle answers again.
- Scene actions: run a Cronicle event and optionally wait for its end (90 s at
  most); read a Cronicle event; abort a Cronicle job. Running and aborting are
  off until allowed in the configuration.
- Dashboard widget: the last runs of the followed events, running ones first,
  with confirmed Run / Abort buttons for the chosen events when allowed.
- "Test the connection" lists every event the API key sees, with its id.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-cronicle/commits/main
