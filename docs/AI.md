# Your AI provider

Open **AI settings** from EZEapply’s sidebar or Settings page. Choose your provider, save your key and select the Fast and Smart models. Model lists can be refreshed, custom model IDs added, unwanted entries hidden and hidden choices restored. Each provider keeps separate settings.

Supported adapters: OpenAI, Anthropic, Gemini, Cerebras, Groq, MiniMax, DeepSeek, Azure AI, Ollama and compatible custom endpoints. Availability depends on the models your provider account exposes. Local Ollama endpoints do not require a cloud account.

In **Answers**, set the answer length, maximum characters, writing instructions and applicant background. **Load PDF / text** extracts readable PDF text locally, preserving useful lines and links; **Use saved résumé** loads the file already in your profile. Text extraction is not an embedding service. It does not need another model or key. Scanned PDFs need OCR or pasted text. Save preferences after loading or editing background.

Focus an eligible open-ended question on a detected job application and click **EZE AI**, or choose **Draft with AI** from the sidebar’s unanswered-question report. The dialog captures the form question and uses your enabled résumé/background automatically. Additional context is optional and collapsed. Generate, review the draft, then apply it. Unknown personal facts should be supplied by you rather than invented.

The form’s smaller character or word limit takes priority over your preference. Existing answers remain protected. EZEapply does not submit applications, silently generate paid answers on every page load, or add AI controls to chats, email or search.

Provider credentials stay in separate extension-origin IndexedDB, never profile or analytics exports. Provider calls go directly from the background worker to the selected endpoint. See [privacy and permissions](PRIVACY.md).
