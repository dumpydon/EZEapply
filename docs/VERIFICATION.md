# Release verification

EZEapply 3.0.0 · 29 October 2026.

- **420 tests across 35 files passed**, plus strict TypeScript with unused locals and parameters checked.
- Regression suite covering matching, unit conversion, label discovery, controlled inputs, native and searchable dropdowns, open shadow roots, frame dispatch, undo, automatic-fill races, application-only AI eligibility, provider credentials and errors, résumé extraction, profile compatibility, tracking persistence, submission confirmation, duplicate capture, analytics, exports and goals.
- Standalone build from repository sources; no cached extension is required.
- Fresh staging and rollback tests prevent stale output or a broken build from replacing the working folder.
- Browser review verified profile saves, popup structure, quick goal editing and progress-ring rendering with synthetic data.
- Dependency audit reported zero known vulnerabilities.
- Runtime packaging includes a file inventory, SHA-256 checksum and required third-party notices; development fixtures, private data, backups and source maps are excluded.
- Original installation film: 15 seconds, 1920×1440, 30 fps H.264; 960×720 GIF preview and text captions.

The browser preview uses synthetic data. Provider requests are mocked in tests. These checks establish represented behavior, not a compatibility percentage for all websites. Review filled values and website upload status before submitting.

Run `npm run verify`, `npm run format:check` and `npm run package` to reproduce the checks and package.
