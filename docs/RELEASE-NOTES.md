EZEapply is created by **Piyush Agarwal (@dumpydon)**.

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
