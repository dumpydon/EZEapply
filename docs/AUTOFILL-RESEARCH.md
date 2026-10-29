# Form compatibility

EZEapply reads connected labels, ARIA names, nearby question headings, autocomplete tokens, unit hints and the field's own context. Matching uses concepts and explicit exclusions rather than requiring an entire question string to be identical. Current and expected compensation, currencies, lakh/rupee scales, durations and experience scopes are kept distinct.

Custom dropdowns require a committed option selection, not just visible typed text. EZEapply supports native selects, associated ARIA popups and selected searchable-widget structures. It scopes options to their control, waits for delayed choices and verifies the result. Ambiguous matches remain blank.

Controlled fields need appropriate input/change events and verification after rendering. Embedded forms need separate content-script contexts. Existing edits and unrelated consent controls remain protected. Résumé inputs receive files only through the explicit Resume action, with file-type and existing-attachment checks.

The local `/compatibility.html`, `/searchable-dropdown.html`, `/automatic-fill.html`, `/salary-format.html` and `/ai-scope.html` labs exercise production code with synthetic inputs. They do not establish a universal ATS support rate. Generic matchers cannot read closed shadow roots, bypass Chrome restrictions or guarantee that a server accepted an upload.

Primary technical references:

- [HTML autocomplete tokens](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Attributes/autocomplete)
- [WAI-ARIA combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
- [Controlled React inputs](https://react.dev/reference/react-dom/components/input)
- [Chrome content scripts and frames](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [HTML file inputs](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file)
