EZEapply is created by **Piyush Agarwal (@dumpydon)**.

## EZEapply 3.0.13

- Fixed Default Yes detection for slotted web-component radio controls, using the SAP SmartRecruiters markup supplied by the user. Radio choices now resolve their group through assigned slots and shadow-root hosts, and custom controls can expose their choice through a label attribute.
- Question labels resolve from the group's accessible label reference. Hidden shadow-root groups and disabled choices remain excluded; existing answers and consent safeguards remain intact.
- Regression tests reconstruct SAP's `spl-form-field`, `spl-radio-group`, and `spl-radio` structure, covering manual and automatic fill, separate groups, existing No answers and unsupported choices. Live Chrome verification remains unavailable because the browser tool reports local browser use disabled.

## EZEapply 3.0.11 — local build

- Renamed the PDF section to Resume and combined the count, short drag hint and Add PDF control in a compact header. The hint wraps beneath the header controls only in narrow panels.
- Placed reorder, download and delete together in one row below each PDF's name and size. The vertical twelve-dot grip and existing file-transfer behavior are retained.
- Verified the revised controls at normal and 300 px panel widths, with regression coverage for keyboard reordering, separate reorder/file-drag events, downloads, deletion confirmation and independent PDF storage.

## EZEapply 3.0.10 — local build

- Replaced each CV tile's overflow menu with direct download and delete icon buttons. Deleting still requires confirmation.
- Added theme-aware, image-generated controls: a compact download icon, a dustbin icon and a vertical twelve-dot reorder grip with three columns and four rows.
- Placed the reorder grip above each PDF and the file actions below its name and size. The toolbar does not start a PDF upload drag, and keyboard reordering remains available.

**Validation:** 568 automated tests, strict TypeScript, formatting, source compilation and ZIP integrity/source checks pass. Chrome preview confirms the generated controls and keyboard reordering. Four tiles also fit in the 300 px preview without horizontal overflow.

## EZEapply 3.0.9 — local build

- The whole CV tile, including its filename, now starts a PDF drag; reorder grips remain separate. Tile text no longer becomes an accidental text selection.
- PDF drags reconnect the active tab's extension receiver and arm it for Chrome's cross-origin string payload. Upload-page drag handlers cannot discard the transfer simply because its native file bytes were stripped by Chrome.
- Drops on styled upload buttons resolve their associated hidden PDF file input and dispatch input/change events. Custom upload areas receive dragenter, dragover and drop events with the reconstructed file. Multiple unrelated inputs are not guessed between.
- Regression coverage includes hidden upload inputs, label associations, disabled/incompatible controls, detached targets, exact file bytes and the full custom-widget drag lifecycle.

**Validation:** 567 automated tests, TypeScript and a fresh build pass. The isolated cross-origin transfer check passed, and the user confirmed that installed PDF dragging now works. The iLovePDF page was not independently verified.

## EZEapply 3.0.8 — local build

- Added an independent CV tray in the side pane with up to four PDF tiles, equal-width layouts, file names, sizes, reorder grips, keyboard reordering and download/remove menus.
- PDFs are kept in their own extension-local database. Adding, removing or reordering them never updates the profile, reusable answers, default résumé or AI context. Files are limited to 20 MB each and are checked for a PDF header.
- Chrome can strip file bytes from cross-origin HTML drags. A single-use, expiring token binds each explicit PDF drag to the active website tab; the content script reconstructs the file only after a genuine drop. Native upload inputs receive input/change events; custom drop areas receive a file drop event. Sites rejecting synthetic drops can use the tile's Download PDF fallback.
- File-picker upload of four PDFs and persistence after reload were verified in Chrome. Cross-origin handoff verification is pending restored browser-tool access. Automated coverage checks storage limits/concurrency, file bytes, isolated storage, 1–4 tile layouts, reordering, deletion confirmation and transfer authorization.

## EZEapply 3.0.7 — local build

- Fixed saved matching phrases being rejected when a monetary answer specifies units but the form omits them. For example, an explicitly saved “Expected Salary” phrase on an INR answer now uses that answer as saved, independently of a separate generic CTC answer.
- Explicit alternatives support equivalent wording, capitalization and punctuation. They do not override a form's stated currency, lakh/rupee format, monthly/yearly period, pay component or response type. Broad substring matches and secondary machine names cannot bypass those checks.
- Conflicting answers assigned to the same question still require disambiguation. Existing scope, exclusions, disabled fields, strict matching and Undo behavior are preserved.
- Added an isolated browser demonstration for manual filling and automatic filling when a new form step appears.

**Validation:** 547 tests pass, including 122 matching/content/format tests. Strict TypeScript, formatting and source-entry compilation pass. Chrome verification confirms that both salary aliases fill with `900000`, native input events update the form's own state, Undo restores both fields, and a new step fills automatically. This browser check uses an isolated synthetic form; the live employer form was not submitted.

## EZEapply 3.0.6 — local build

- Daily application counts now use midnight UTC (5:30 a.m. IST), consistently across the popup, side pane, manual corrections and 7-/15-/30-day analytics.
- Open counters and charts refresh at the UTC day boundary and catch up after the computer wakes. Earlier applications remain in history; the daily goal is preserved.
- Existing submission timestamps are regrouped into UTC days, and derived count caches are rebuilt on startup. Existing date-only manual corrections and goal history retain their recorded dates.
- Analytics exports identify their UTC day basis, and application dates are displayed in UTC. Counter tooltips show the reset time without changing the layout.

**Validation:** 523 tests pass, along with strict TypeScript, formatting and source-entry compilation. The 79 counter/tracking/analytics tests also pass with UTC, Asia/Kolkata and America/Los_Angeles host time zones, including IST midnight, the exact 5:30 a.m. rollover, wake-up refresh, retained history and worker restarts.

## EZEapply 3.0.5 — local build

- Added radio question and option detection for controls whose visible text is rendered in adjacent elements without HTML label associations. Generated group names and numeric option values no longer have to serve as question/answer text.
- Reproduced the reported LinkedIn failure using the supplied DOM: both radios repeat the question in `aria-label`, have empty associated labels and no distinct `value`. The reader now prioritizes the visible Yes/No paragraph belonging to each choice. No company names, question wording or generated CSS classes are used in the fix.
- Text detection stays within one logical option or question group; it stops at other controls or form boundaries and excludes hidden text and icons.
- LinkedIn application detection also recognizes dialogs beginning with a plain-text application title and an application step on a jobs route.
- Default Yes reports distinguish unreadable choices from an unrecognized application context. Tests and the local demonstration cover adjacent labels, numeric option values, custom click handlers and the complete stored-preference/autofill flow.
- Regression tests use the captured LinkedIn structure for manual filling, automatic filling after a step change or script restart, native change events, Undo and preservation of existing answers.

**Automated validation:** 507 tests pass, along with strict TypeScript. The captured DOM reproduces the earlier failure before the reader correction; live LinkedIn verification remains pending browser access.

## EZEapply 3.0.4 — local build

- Fixed detection and selection of styled Yes/No radio controls whose native inputs are hidden behind visible labels. Filling clicks the associated label and verifies the native checked state.
- Option matching now reads each option's own label before a combined question/option accessibility label, and supports options named through `aria-label`.
- An ARIA wrapper and its backing native radio are treated as one option. Existing No answers, hidden form steps, disabled questions and questions with extra choices remain untouched.
- Added regression coverage on a LinkedIn-origin document and extended the real panel → background → storage → autofill integration test to use CSS-hidden radio inputs.

**Automated validation:** 488 tests pass, along with strict TypeScript, formatting and source-entry compilation.

## EZEapply 3.0.3 — local build

- Eight muted dark color themes, including Magenta Gray, with a darker Midnight Teal default.
- A compact palette chooser in the popup, side-panel toolbar and profile/settings navigation. Changes appear immediately across open EZEapply views and persist on this device.
- Theme-aware controls, profile cards, AI settings and analytics surfaces. Chart-source and error colors retain their meaning.
- Contrast checks cover every palette. Persistence, delayed startup reads, save failures, keyboard navigation and a 300 px side panel were verified.
- Added an opt-in **Default Yes** switch beneath the side-panel search. It automatically selects Yes for unanswered application questions offering exactly Yes and No, including native dropdowns and supported radio groups. Existing answers are kept; questions with additional choices are left alone.
- The Yes/No preference persists locally and works independently of saved-answer autofill. Automatic filling respects the master Autofill switch and pauses after Undo.

**Automated validation:** 478 tests cover the real panel → background → storage → autofill flow, new form steps, existing No selections, extra/hidden options, unrelated forms, disabled settings and native Undo. TypeScript, formatting, source-entry compilation and ZIP integrity/source checks pass.

At the time of this local build, the published stable download was 3.0.2.

## EZEapply 3.0.2

Download **EZEapply.zip**, extract it, then open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked → EZEapply**. Select the folder containing `manifest.json`. Keep that folder after installation. The attached 30-second film walks through the macOS / Chrome steps.

- Improved native and custom dropdown selection, including placeholder prompts, punctuation/case differences and adjacent popup containers.
- Restored compact profile cards: collapsible work descriptions, portfolio link icons, skill chips and quick edits.
- Added dense background artwork and generated popup icons, with small raised buttons and a shortcut to Chrome’s extension manager.
- Improved API-key saving on blur, Done and provider/tab changes. Saved keys remain hidden, with an explicit saved-status message. Local persistence is tested across worker restarts.
- Rebuilt the download from current sources. ZIP entries, checksums, extension identity and source hashes are verified before release; the installation ZIP contains no development fixtures or user data.

This release includes reusable answers and profile shortcuts, application-only automatic filling, supported searchable dropdowns, résumé helpers, your own AI provider and model settings, LinkedIn company-follow opt-out, and a dedicated analytics page with 7-, 15- and 30-day charts.

The independent build compiles entirely from repository sources. It preserves the existing EZEapply extension identity and local-data schemas. Export your profile and reusable answers before updating; replace files in the same installed folder, click Reload in Chrome, and refresh application tabs.

**Validation:** 454 tests, strict TypeScript, fresh staged build, ZIP integrity/source checks and no known production dependency vulnerabilities in the release audit. Synthetic compatibility coverage is not a claim that every employer widget will work. Review answers before submitting; EZEapply does not submit applications for you.

Required third-party library notices are included. AI generation is optional and uses your own provider credentials and billing.
