# Public-release code review

Reviewed 29 October 2026 for the independent EZEapply 3.0.0 release.

## Changes made

- Replaced the inherited app shell, worker entry point, UI patching adapters and cached runtime assets with original repository-owned code. The build no longer reads another extension or a private source cache.
- Preserved the installed extension ID, profile keys, custom-library schema, AI settings database and application ledger. Import normalization retains structured history dates and untouched values.
- Removed unused worker frame-cache state, obsolete overlay/style adapters, conditional integration tests and historical setup instructions. Kept active compatibility fixtures and regression cases.
- Isolated profile writes and application-stage writes behind trusted extension-view messages. Serial stage updates prevent concurrent edits from losing each other.
- Retained separate credential storage, endpoint validation, bounded provider parsing, application-only AI eligibility and explicit review before applying an AI draft.
- Added strict unused-code checks, consistent formatting, clean staged builds with rollback, an explicit package allowlist and checksums. CI runs the same source checks.
- Kept the popup compact: one Analytics shortcut, small count controls and a goal editor. Detailed charts remain on their own page.
- Created original installation artwork and film from editable source. No real account, résumé, key or browser recording appears in public media.
- Included required notices for the open-source phone and PDF libraries and bundled PDF fonts.

## Practical limits

No test suite establishes universal form compatibility. Closed web components, inaccessible frames, ambiguous questions, repeated history sections and bespoke widgets can require manual entry. Saved-answer matching uses deterministic semantic concepts, synonyms and unit constraints; AI drafting is a separate explicit action. Confirmation capture can miss unusual submission flows, so count corrections remain available.

API protocol tests use mocks. Real provider availability and paid generation require the user's own key. Browser tests use synthetic applicant data; the installed Chrome build must be reloaded after an update.

See [verification](VERIFICATION.md), [development](DEVELOPMENT.md) and [privacy](PRIVACY.md).
