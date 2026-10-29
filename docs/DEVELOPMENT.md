# Development

Use Node.js 22 or newer and npm. Install from the lockfile with `npm ci`.

```sh
npm run verify        # strict TypeScript, regression suite, complete extension build
npm run format:check  # reproducible formatting
npm run package       # fresh build, reviewed ZIP, SHA-256 and file inventory
npm run preview       # synthetic browser lab at http://127.0.0.1:4317
```

Load `dist/extension` in Chrome’s unpacked-extension manager. The build starts from an empty staging folder, compiles repository sources and publishes the finished folder with rollback protection. Old chunks cannot survive a rebuild. `scripts/local-public-key.txt` is a public identity key, not a credential; keep it stable for in-place updates.

## Modules

| Area                                                   | Sources                                                                      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Popup, profile, settings and application journal       | `src/app-ui.ts`, `app-profile.ts`, `app-background.ts`                       |
| Sidebar answer library and shortcut edits              | `src/panel.ts`, `storage.ts`, `order.ts`, `drag.ts`                          |
| Question meaning, units and formatting                 | `src/matcher.ts`, `matching-terms.ts`, `matching-text.ts`, `field-format.ts` |
| Form discovery and field interaction                   | `src/content.ts`, `form-labels.ts`, `widgets.ts`, `resume.ts`                |
| Application-context policy                             | `src/application-context.ts`, `src/ai/fields.ts`                             |
| BYOK settings, provider adapters and reviewed drafting | `src/ai/`                                                                    |
| Confirmed submission capture and durable ledger        | `src/submission-capture.ts`, `tracking-background.ts`, `tracking-store.ts`   |
| Charts, goals, journal and exports                     | `src/analytics.ts`, `tracking-model.ts`, `activity-controls.ts`              |
| LinkedIn opt-out and optional restore control          | `src/linkedin-follow.ts`, `panel-dock.ts`, `popup-controls.ts`               |
| Original illustrated installation film                 | `media-src/install-film.mjs`                                                 |

## Verification boundaries

Tests use synthetic applicant data. Browser labs substitute only extension transport and synthetic storage; production matchers, interactions and tracking code run unchanged. Fixtures are development assets and are excluded from the ZIP. Tests are explicitly confined to `tests/` so ignored backups and dependencies cannot become accidental test inputs.

Provider protocol tests mock network responses. They do not spend a real API key. Compatibility fixtures establish support for represented patterns, not a measured success rate across every employer website. A new failing form should become a focused regression case.

`npm run media:render` requires `ffmpeg` on PATH and regenerates the 1920×1440 MP4, README GIF, poster and captions. See [film instructions](../media-src/README.md).

## Public files

Only source, tests, synthetic fixtures, documentation, original media and the reviewed install ZIP belong in Git. `dist/`, `node_modules/`, `.local/`, browser exports, account state and render scratch files remain excluded. The package allowlist rejects unexpected files, source maps and private data-file formats. Runtime dependencies carry their required notices; see [third-party notices](../THIRD-PARTY-NOTICES.md).

## Publishing

The GitHub workflow checks formatting, TypeScript, tests and a clean build before publishing a new `package.json` version. Its release job verifies the reviewed ZIP checksum and archive integrity, then creates a versioned GitHub Release with the ZIP, checksum and installation MP4. Existing version assets are left unchanged. Write access is limited to that release job on pushes to `main`; pull requests receive read-only checks.
