# Application tracking and analytics — 29 October 2026

## Product layout

Keep the existing popup, application ring, profile, saved answers and tracker. Add one matching Analytics shortcut beside the existing shortcuts and a small pencil next to the daily goal. The analytics shortcut opens a dedicated extension page; charts do not crowd the popup or application form.

The analytics page uses blue for LinkedIn Easy Apply, teal for external application forms, and neutral tones for imported records whose submission channel cannot be established. Existing manual counter corrections are labelled separately. No historic channel attribution is invented.

## Capture and storage

Track the sequence **application submission intent → affirmative confirmation → saved application**. Submit clicks alone, validation failures, Next/Review controls, closed dialogs and unrelated success notifications do not count. Support LinkedIn Easy Apply dialogs, external form success messages, dynamic pages and same-origin thank-you navigation. Retain pending intents across document navigation and worker restarts, with expiry and tab/frame identity checks. Repeated messages must be idempotent.

Use a durable local ledger. Combine existing tracker records with new confirmations and deduplicate overlapping job identity/date records. Keep applicant answers, credentials, resume contents and page-wide text out of the ledger. The counter must follow the combined ledger while preserving manual adjustments; no fake tracker entries are created for a + click.

## Analytics and controls

- Quick daily goal editing in the popup, native side panel and analytics page; one shared goal value, integer validation and a dated goal-change history.
- Last 7, 15 or 30 calendar days, including today, with zero-filled dates and comparisons against the preceding equal-length period.
- A stacked daily bar chart, source totals, daily average, period-over-period growth, streak and best-day statistics. No invented percentage when the comparison period is zero.
- Recent applications with channel, date and confirmation/import status; CSV and JSON export of tracking data only.
- Accessible labels, keyboard controls, reduced-motion support, responsive layout, and intentional empty/loading/error states.

## Verification and limits

Test success and failure flows, both channels, duplicate events, navigation, storage recovery, concurrent updates, time boundaries, source migration, goal changes, exports and popup regressions. Check the production UI in a visible local browser with synthetic data, without submitting a real employer application.

Different sites expose different confirmation signals. The product should identify evidence it actually observed and retain honest unknown/imported labels; it cannot guarantee capture on every employer site. Installation needs the normal extension reload after building.

## Research informing the design

- [MDN: the form submit event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/submit_event) — submit events and validation are distinct from successful server acceptance.
- [Chrome: extension service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle) — persist important state instead of relying on a worker's global variables.
- [LinkedIn: applying directly with Easy Apply](https://www.linkedin.com/help/linkedin/answer/a512348) — distinguish the on-LinkedIn submission flow from applications hosted elsewhere.
