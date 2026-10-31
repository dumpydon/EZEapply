# Release verification

EZEapply 3.0.2 · 31 October 2026.

- **454 tests across 37 files passed**, plus strict TypeScript with unused locals and parameters checked.
- Regression suite covering matching, unit conversion, label discovery, controlled inputs, native and searchable dropdowns, open shadow roots, frame dispatch, undo, automatic-fill races, application-only AI eligibility, provider credentials and errors, résumé extraction, profile compatibility, tracking persistence, submission confirmation, duplicate capture, analytics, exports and goals.
- Standalone build from repository sources; no cached extension is required.
- Fresh staging and rollback tests prevent stale output or a broken build from replacing the working folder.
- Credential regressions cover committed-key persistence across worker restarts, failed model refreshes, save failures and edits made during an in-flight save.
- Dropdown regressions cover case/punctuation differences, nonempty placeholder values, native selects exposed as comboboxes and adjacent popup ownership without borrowing another question’s options.
- Browser review verified profile saves, popup structure, quick goal editing and progress-ring rendering with synthetic data.
- Release smoke checks verified profile expansion and a 300 px panel without horizontal overflow, native/custom prefix selection, gender/country selection on a newly revealed step, AI suppression in chat, and 7-/15-/30-day analytics navigation.
- Dependency audit reported zero known vulnerabilities.
- Runtime packaging includes file and source inventories, a SHA-256 checksum and required third-party notices. Every ZIP entry is checked against its inventory; CI rejects a download whose source inputs no longer match the repository. Development fixtures, private data, backups and source maps are excluded.
- Negative release checks accepted the intact package and rejected a stale source file, a mismatched runtime hash and a truncated ZIP.
- Revised installation film: 30 seconds, 1920×1440, 30 fps H.264; 960×720 GIF preview and seven timed caption chapters. Exported video decoded without errors; reviewed GitHub scrolling, URL typing, Developer mode, Load unpacked, folder selection and the final job form.

The browser preview uses synthetic data. Provider requests are mocked in tests. These checks establish represented behavior, not a compatibility percentage for all websites. Review filled values and website upload status before submitting.

Run `npm run verify`, `npm run format:check` and `npm run package` to reproduce the checks and package. `npm run check:release` checks the existing download without replacing it.
