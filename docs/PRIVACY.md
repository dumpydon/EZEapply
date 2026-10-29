# Privacy and permissions

EZEapply has no account service, analytics endpoint, subscription server or remote sync. Profile details, résumé files, saved answers and application history are stored in the current Chrome profile. Separate local IndexedDB databases hold the answer library, application ledger and AI provider settings. This is browser-profile storage, not an operating-system keychain.

## AI requests

Only an explicit **Generate** action sends the question, relevant job text, enabled saved profile facts, reusable answers, saved background/résumé text and any optional extra context to the selected provider. API keys are sent only as credentials to that provider. They are not included in prompts, profile exports, analytics exports or page DOM. Provider usage is billed by the provider; EZEapply has no free-response quota.

Custom endpoints must use HTTPS; local model endpoints may use HTTP on loopback. Changing the endpoint clears its saved key so a previous credential is not silently sent to a new host. Review a custom endpoint before configuring it.

## Chrome permissions

| Permission                    | Purpose                                                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| HTTP/HTTPS site access        | Recognize job applications, read their questions, fill answers, and contact your chosen AI endpoint. Chrome still controls site access. |
| `storage`, `unlimitedStorage` | Keep settings and a local résumé; avoid the small default quota for saved files.                                                        |
| `clipboardWrite`              | Copy a saved answer with one click.                                                                                                     |
| `webNavigation`               | Enumerate application frames and reconnect after navigation.                                                                            |
| `scripting`                   | Reconnect the guarded content script on a tab opened before installation or reload.                                                     |
| `sidePanel`                   | Display the native Chrome sidebar.                                                                                                      |

Automatic filling and inline AI controls are gated by application context and per-field eligibility. Chats, email composition, search bars and unrelated forms are excluded. A manual **Fill this page** action is a separate user-directed action. The optional LinkedIn follow setting unticks only company-follow controls in application dialogs.

EZEapply never clicks Submit, Next or Review. The explicit **Resume** action can trigger a website’s upload handler; it does not prove the server accepted the file. Undo cannot recall an uploaded file. Application tracking listens for affirmative confirmation after a submission intent and stores job metadata, not form-answer snapshots.

Profile exports contain applicant details and any saved résumé. Keep them private. Reusable-answer exports and analytics exports do not include provider credentials. No personal browser state, account exports, keys or résumé files are shipped in the public repository or ZIP.
