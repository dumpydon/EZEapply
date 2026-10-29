import {
  LABELS,
  PROVIDERS,
  modelId,
  type Provider,
  type PublicSettings,
  type Tier,
} from './config';
import { extractResumePDF, type ResumeText } from './resume-text';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') {
  const el = document.createElement(tag);
  el.className = cls;
  el.textContent = text;
  return el;
}
function button(label: string, cls = 'action') {
  const el = node('button', cls, label);
  el.type = 'button';
  return el;
}
async function rpc(type: string, extra: Record<string, unknown> = {}) {
  const result = await chrome.runtime.sendMessage({ type: `eze-ai:${type}`, ...extra });
  if (!result || result.error)
    throw new Error(result?.error || 'Could not reach EZEapply. Reload the extension.');
  return result;
}
export async function mountAISettings(host: HTMLElement): Promise<void> {
  host.className = 'ai-settings';
  const head = node('header', 'head'),
    title = node('h1', '', 'Settings'),
    logo = node('img', 'logo');
  logo.src = chrome.runtime.getURL('custom/icon/32.png');
  logo.alt = 'EZEapply';
  const done = button('Done', 'done');
  head.append(logo, title, done);
  const tabs = node('div', 'tabs');
  tabs.setAttribute('role', 'tablist');
  const keysTab = button('🔑 API Keys', 'tab on'),
    styleTab = button('✦ Answers', 'tab');
  keysTab.setAttribute('role', 'tab');
  styleTab.setAttribute('role', 'tab');
  keysTab.setAttribute('aria-selected', 'true');
  styleTab.setAttribute('aria-selected', 'false');
  tabs.append(keysTab, styleTab);
  const keys = node('section', 'body'),
    writing = node('section', 'body');
  writing.hidden = true;
  const status = node('p', 'status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  host.replaceChildren(head, tabs, keys, writing, status);
  let settings = (await rpc('settings')).settings as PublicSettings;
  let provider: Provider = settings.provider,
    epoch = 0,
    saving: Promise<void> = Promise.resolve();
  let closeMenu: (() => void) | undefined;
  let persistWriting: (() => Promise<void>) | undefined;
  let writingTimer: ReturnType<typeof setTimeout> | undefined;
  let saveFailed = false;
  function feedback(text: string, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
  }
  async function change(action: Record<string, unknown>): Promise<void> {
    const task = saving.then(async () => {
      const result = await rpc('edit', { action });
      settings = result.settings;
      saveFailed = false;
      feedback('Saved on this device.');
    });
    saving = task.catch((error) => {
      saveFailed = true;
      feedback(error.message, true);
    });
    return task;
  }
  function section(parent: HTMLElement, label: string, hint = '') {
    const el = node('h2', 'label', label);
    if (hint) el.append(node('span', 'hint', hint));
    parent.append(el);
  }
  function field(parent: HTMLElement, label: string, input: HTMLElement) {
    const row = node('div', 'field'),
      name = node('label', '', label);
    input.id ||= `eze-ai-${crypto.randomUUID()}`;
    name.htmlFor = input.id;
    row.append(name, input);
    parent.append(row);
    return row;
  }
  function input(value = '', type = 'text') {
    const el = node('input');
    el.type = type;
    el.value = value;
    el.autocomplete = 'off';
    el.spellcheck = false;
    return el;
  }
  done.addEventListener('click', async () => {
    try {
      clearTimeout(writingTimer);
      await persistWriting?.();
      await saving;
      if (saveFailed) return;
      closeMenu?.();
      window.close();
      if (!window.closed) feedback('Settings saved. You can return to your application.');
    } catch {
      /* The save error remains visible. */
    }
  });
  for (const [tab, panel] of [
    [keysTab, keys],
    [styleTab, writing],
  ] as const)
    tab.addEventListener('click', () => {
      closeMenu?.();
      keys.hidden = panel !== keys;
      writing.hidden = panel !== writing;
      keysTab.classList.toggle('on', panel === keys);
      styleTab.classList.toggle('on', panel === writing);
      keysTab.setAttribute('aria-selected', String(panel === keys));
      styleTab.setAttribute('aria-selected', String(panel === writing));
    });
  async function refresh(force = false) {
    const requested = provider,
      generation = epoch;
    refreshButton.disabled = true;
    catalogStatus.textContent = `Refreshing ${LABELS[provider]} models…`;
    try {
      await saving;
      const result = await rpc('models', { provider: requested, force });
      if (epoch !== generation) return;
      settings = result.settings;
      catalogStatus.textContent = result.message || 'Model list is up to date.';
    } catch (error) {
      if (epoch === generation)
        catalogStatus.textContent =
          error instanceof Error ? error.message : 'Could not refresh models.';
    } finally {
      if (epoch === generation) refreshButton.disabled = false;
    }
  }
  let refreshButton: HTMLButtonElement, catalogStatus: HTMLParagraphElement;
  function modelPicker(tier: Tier) {
    const wrap = node('div', 'model-combobox'),
      selected = input(settings.providers[provider][tier]),
      toggle = button('⌄', 'model-trigger');
    selected.setAttribute('aria-label', tier === 'fast' ? 'Fast model' : 'Smart model');
    selected.setAttribute('role', 'combobox');
    selected.setAttribute('aria-expanded', 'false');
    selected.setAttribute('aria-autocomplete', 'list');
    selected.setAttribute('aria-haspopup', 'dialog');
    toggle.setAttribute('aria-label', `Choose ${tier === 'fast' ? 'Fast' : 'Smart'} model`);
    wrap.append(selected, toggle);
    let menu: HTMLDivElement | undefined;
    const chosenProvider = provider;
    function close(focus = false) {
      menu?.remove();
      menu = undefined;
      selected.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      if (focus) selected.focus();
    }
    function outside(event: Event) {
      if (!menu?.contains(event.target as Node) && !wrap.contains(event.target as Node)) close();
    }
    function position() {
      if (!menu) return;
      const rect = wrap.getBoundingClientRect(),
        below = innerHeight - rect.bottom - 12,
        above = rect.top - 12;
      const up = below < 300 && above > below;
      menu.style.width = `${Math.min(rect.width, innerWidth - 24)}px`;
      menu.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - rect.width - 12))}px`;
      menu.style.maxHeight = `${Math.min(340, up ? above : below)}px`;
      menu.style.top = up ? 'auto' : `${rect.bottom + 6}px`;
      menu.style.bottom = up ? `${innerHeight - rect.top + 6}px` : 'auto';
    }
    async function choose(raw: string) {
      try {
        const id = modelId(raw);
        await change({ kind: 'model', provider: chosenProvider, tier, id });
        selected.value = id;
        close(true);
      } catch (error) {
        feedback(error instanceof Error ? error.message : 'Could not save model.', true);
      }
    }
    function open(filter = false) {
      closeMenu?.();
      closeMenu = () => close();
      menu = node('div', 'model-menu');
      menu.setAttribute('role', 'dialog');
      menu.setAttribute('aria-label', `Choose ${tier} model`);
      document.body.append(menu);
      selected.setAttribute('aria-expanded', 'true');
      function render() {
        if (!menu) return;
        menu.replaceChildren();
        const config = settings.providers[chosenProvider],
          saved = new Set(config.entries.map((item) => item.id));
        const query = filter ? selected.value.toLowerCase().replace(/[^a-z0-9.]/g, '') : '';
        let count = 0;
        const groups = [
          [
            'Your frequently used models',
            [...config.entries].sort((a, b) => b.uses - a.uses || b.selectedAt - a.selectedAt),
          ],
          [
            `${LABELS[chosenProvider]} models`,
            config.catalog.filter((item) => !saved.has(item.id)),
          ],
        ] as const;
        for (const [label, choices] of groups) {
          const visible = choices.filter(
            (item) =>
              !config.hidden.includes(item.id) &&
              (!query ||
                (item.label + item.id)
                  .toLowerCase()
                  .replace(/[^a-z0-9.]/g, '')
                  .includes(query)),
          );
          if (!visible.length) continue;
          menu.append(node('div', 'model-group', label));
          for (const item of visible) {
            count++;
            const row = node('div', 'model-row'),
              option = button('', 'model-option'),
              text = node('span', 'model-text');
            text.append(node('span', 'model-name', item.label), node('small', 'model-id', item.id));
            option.append(text);
            if (item.id === config[tier]) option.append(node('span', 'selected', '✓'));
            option.addEventListener('click', () => {
              void choose(item.id);
            });
            const remove = button('♧', 'model-delete');
            remove.textContent = '';
            const trash = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            trash.setAttribute('viewBox', '0 0 24 24');
            trash.setAttribute('width', '15');
            trash.setAttribute('height', '15');
            trash.setAttribute('fill', 'none');
            trash.setAttribute('stroke', 'currentColor');
            trash.setAttribute('stroke-width', '1.8');
            trash.setAttribute('aria-hidden', 'true');
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7');
            trash.append(path);
            remove.append(trash);
            remove.setAttribute('aria-label', `Remove ${item.label} from choices`);
            remove.title = 'Remove from choices';
            remove.addEventListener('click', async () => {
              remove.disabled = true;
              try {
                await change({ kind: 'hide-model', provider: chosenProvider, id: item.id });
                render();
                feedback('Removed from your choices. Current model selection is unchanged.');
              } catch {
                remove.disabled = false;
              }
            });
            row.append(option, remove);
            menu.append(row);
          }
        }
        if (!count)
          menu.append(node('p', 'hint', 'No matching models. Type a model ID to add one.'));
        if (selected.value.trim()) {
          const custom = button(`Use “${selected.value.trim()}”`, 'custom-model');
          custom.addEventListener('click', () => {
            void choose(selected.value);
          });
          menu.append(custom);
        }
        if (config.hidden.length) {
          const restore = button(`Restore hidden models (${config.hidden.length})`, 'custom-model');
          restore.addEventListener('click', async () => {
            try {
              await change({ kind: 'restore-models', provider: chosenProvider });
              render();
            } catch {}
          });
          menu.append(restore);
        }
        position();
      }
      render();
      menu.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          close(true);
        }
        if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const items = [...menu!.querySelectorAll<HTMLButtonElement>('button')],
            index = items.indexOf(document.activeElement as HTMLButtonElement);
          items[
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? items.length - 1
                : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
          ]?.focus();
        }
      });
      document.addEventListener('pointerdown', outside, true);
      window.addEventListener('resize', position);
      window.addEventListener('scroll', position, true);
    }
    selected.addEventListener('click', () => open());
    selected.addEventListener('input', () => open(true));
    selected.addEventListener('change', () => {
      if (selected.value.trim()) void choose(selected.value);
    });
    selected.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        void choose(selected.value);
      } else if (event.key === 'Escape') close(true);
      else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        if (!menu) open();
        menu?.querySelector<HTMLButtonElement>('button')?.focus();
      }
    });
    toggle.addEventListener('click', () => {
      if (menu) close(true);
      else open();
    });
    field(keys, tier === 'fast' ? 'Fast' : 'Smart', wrap);
  }
  function renderProvider() {
    closeMenu?.();
    epoch++;
    keys.replaceChildren();
    section(keys, 'Provider');
    const grid = node('div', 'providers');
    for (const id of PROVIDERS) {
      const item = button(LABELS[id], `provider${id === provider ? ' on' : ''}`);
      item.setAttribute('aria-pressed', String(id === provider));
      item.addEventListener('click', async () => {
        try {
          await change({ kind: 'general', selectedProvider: id });
          provider = id;
          renderProvider();
        } catch {}
      });
      grid.append(item);
    }
    keys.append(grid);
    section(keys, 'API keys & URLs', 'stored locally · used only to contact your providers');
    const config = settings.providers[provider],
      chosenProvider = provider;
    const key = input('', 'password');
    key.placeholder = config.hasKey
      ? '••••••••  Saved — paste to replace'
      : provider === 'custom' || provider === 'ollama'
        ? 'Optional API key'
        : `Paste your ${LABELS[provider]} API key`;
    const keyRow = field(keys, LABELS[provider], key),
      save = button('Save', 'small-action'),
      forget = button('Remove', 'small-action');
    forget.hidden = !config.hasKey;
    keyRow.append(save, forget);
    save.addEventListener('click', async () => {
      if (!key.value.trim()) {
        feedback('Paste a key first. Use Remove to delete a saved key.', true);
        return;
      }
      save.disabled = true;
      try {
        await change({ kind: 'provider', provider: chosenProvider, apiKey: key.value });
        key.value = '';
        key.placeholder = '••••••••  Saved — paste to replace';
        forget.hidden = false;
        void refresh(true);
      } catch {
      } finally {
        save.disabled = false;
      }
    });
    key.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        save.click();
      }
    });
    forget.addEventListener('click', async () => {
      if (!window.confirm(`Remove the saved ${LABELS[chosenProvider]} API key from this device?`))
        return;
      try {
        await change({ kind: 'provider', provider: chosenProvider, apiKey: '' });
        key.value = '';
        key.placeholder = `Paste your ${LABELS[chosenProvider]} API key`;
        forget.hidden = true;
      } catch {}
    });
    if (['custom', 'ollama', 'azure'].includes(provider)) {
      const endpoint = input(config.baseUrl, 'url');
      endpoint.placeholder =
        provider === 'ollama'
          ? 'http://localhost:11434'
          : provider === 'azure'
            ? 'https://resource.openai.azure.com'
            : 'https://your-provider.example/v1';
      field(keys, provider === 'azure' ? 'Endpoint' : 'Base URL', endpoint);
      endpoint.addEventListener('change', async () => {
        try {
          await change({ kind: 'provider', provider: chosenProvider, baseUrl: endpoint.value });
          renderProvider();
          feedback('Endpoint saved. Re-enter a key if the endpoint changed.');
        } catch {}
      });
      keys.append(
        node(
          'p',
          'help',
          provider === 'azure'
            ? 'Azure OpenAI / AI Foundry v1 endpoint. Enter your deployment name as the model.'
            : provider === 'custom'
              ? 'OpenAI-compatible chat API. Requests and this provider’s key go directly to this URL.'
              : 'Local Ollama server. Use localhost HTTP or a secure HTTPS endpoint.',
        ),
      );
    }
    if (provider === 'anthropic') {
      const workspace = input(config.workspace);
      workspace.placeholder = 'Optional workspace ID';
      field(keys, 'Workspace', workspace);
      workspace.addEventListener('change', () => {
        void change({
          kind: 'provider',
          provider: chosenProvider,
          workspace: workspace.value,
        }).catch(() => {});
      });
    }
    if (provider === 'minimax') {
      const region = node('select');
      for (const [value, label] of [
        ['global', 'Global'],
        ['china', 'China'],
      ]) {
        const option = node('option', '', label);
        option.value = value;
        region.append(option);
      }
      region.value = config.region;
      field(keys, 'Region', region);
      region.addEventListener('change', async () => {
        try {
          await change({ kind: 'provider', provider: chosenProvider, region: region.value });
          renderProvider();
          feedback('Region changed. Add the key for this region.');
        } catch {}
      });
    }
    section(keys, 'Models', 'fast = Smart off · smart = Smart on');
    modelPicker('fast');
    modelPicker('smart');
    const tools = node('div', 'catalog-tools');
    refreshButton = button(`Refresh ${LABELS[provider]} models`);
    catalogStatus = node(
      'p',
      'hint',
      'Type a model ID to add it. Remove choices with the delete button.',
    );
    refreshButton.addEventListener('click', () => {
      void refresh(true);
    });
    tools.append(refreshButton, catalogStatus);
    keys.append(tools);
    const smartLabel = node('label', 'check'),
      smart = input();
    smart.type = 'checkbox';
    smart.checked = settings.smart;
    smartLabel.append(smart, 'Use Smart model by default');
    keys.append(smartLabel);
    smart.addEventListener('change', () => {
      void change({ kind: 'general', smart: smart.checked }).catch(() => {
        smart.checked = settings.smart;
      });
    });
    keys.append(
      node(
        'p',
        'privacy',
        'Keys stay in this extension’s local storage and are never included in profile exports or shared with websites. AI requests go directly to your chosen provider; its usage charges apply. No EZEapply subscription or response quota.',
      ),
    );
    if (config.hasKey || provider === 'ollama' || (provider === 'custom' && config.baseUrl))
      void refresh();
  }
  function renderWriting() {
    writing.replaceChildren();
    section(writing, 'Answer style', 'adjust the length and context used for application drafts');
    const length = node('select');
    for (const [value, label] of [
      ['short', 'Short · 1–2 sentences'],
      ['balanced', 'Balanced · compact paragraph'],
      ['detailed', 'Detailed · focused explanation'],
    ]) {
      const option = node('option', '', label);
      option.value = value;
      length.append(option);
    }
    length.value = settings.length;
    field(writing, 'Length', length);
    length.addEventListener('change', () => {
      void change({ kind: 'general', length: length.value }).catch(() => {});
    });
    const limit = input(String(settings.maxCharacters), 'number');
    limit.min = '50';
    limit.max = '10000';
    field(writing, 'Max characters', limit);
    limit.addEventListener('change', () => {
      void change({ kind: 'general', maxCharacters: Number(limit.value) }).catch(() => {});
    });
    writing.append(
      node(
        'p',
        'help',
        'A form’s smaller character or word limit takes priority. You review the draft before it is entered.',
      ),
    );
    const include = input();
    include.type = 'checkbox';
    include.checked = settings.includeProfile;
    const label = node('label', 'check');
    label.append(include, 'Use saved profile and custom answers as applicant context');
    writing.append(label);
    include.addEventListener('change', () => {
      void change({ kind: 'general', includeProfile: include.checked }).catch(() => {});
    });
    section(writing, 'Writing instructions');
    const instructions = node('textarea');
    instructions.value = settings.instructions;
    instructions.maxLength = 4000;
    instructions.placeholder = 'For example: Keep answers direct. Avoid buzzwords.';
    instructions.setAttribute('aria-label', 'Writing instructions');
    writing.append(instructions);
    section(writing, 'Résumé & applicant background', 'used automatically for your AI answers');
    const contextState = node('p', 'context-state');
    contextState.setAttribute('role', 'status');
    writing.append(contextState);
    const editor = node('details', 'background-editor'),
      review = node('summary', '', 'Review or edit background text');
    editor.open = !settings.background.trim();
    const background = node('textarea', 'background');
    background.value = settings.background;
    background.maxLength = 30000;
    background.placeholder =
      'Paste résumé text or extra facts here. Saved text is reused for each AI answer.';
    background.setAttribute('aria-label', 'Applicant background');
    editor.append(review, background);
    writing.append(editor);
    const controls = node('div', 'writing-actions'),
      loadResume = button('Use saved résumé'),
      fileLabel = button('Load PDF / text'),
      file = input('', 'file'),
      save = button('Save answer preferences', 'done');
    file.accept = '.pdf,.txt';
    file.hidden = true;
    controls.append(loadResume, fileLabel, file, save);
    writing.append(controls);
    let revision = 0;
    const dirty = () =>
      instructions.value !== settings.instructions || background.value !== settings.background;
    function contextStatus(error = false) {
      contextState.classList.toggle('error', error);
      contextState.textContent = error
        ? 'Could not save these changes. The editor still contains them; use Save to retry.'
        : dirty()
          ? 'Unsaved changes · saving on this device…'
          : settings.background.trim()
            ? `Ready for AI · ${settings.background.length.toLocaleString()} saved characters · included automatically with every draft`
            : 'No résumé/background saved yet. Load a PDF or add text once to reuse it for future answers.';
    }
    persistWriting = async () => {
      if (!dirty()) {
        contextStatus();
        return;
      }
      try {
        await change({
          kind: 'general',
          instructions: instructions.value,
          background: background.value,
        });
        contextStatus();
      } catch (error) {
        contextStatus(true);
        throw error;
      }
    };
    const scheduleSave = () => {
      revision++;
      clearTimeout(writingTimer);
      contextStatus();
      writingTimer = setTimeout(() => {
        if (host.isConnected) void persistWriting?.().catch(() => {});
      }, 450);
    };
    background.addEventListener('input', scheduleSave);
    instructions.addEventListener('input', scheduleSave);
    const flushSave = () => {
      clearTimeout(writingTimer);
      void persistWriting?.().catch(() => {});
    };
    background.addEventListener('change', flushSave);
    instructions.addEventListener('change', flushSave);
    async function importBackground(read: () => Promise<ResumeText>) {
      const started = revision;
      loadResume.disabled = fileLabel.disabled = done.disabled = true;
      feedback('Reading résumé/background locally…');
      try {
        const result = await read();
        if (revision !== started)
          throw new Error(
            'Your background changed while the file was loading. Your edits were kept; load the file again if needed.',
          );
        clearTimeout(writingTimer);
        background.value = result.text;
        revision++;
        await persistWriting?.();
        editor.open = false;
        feedback(
          `Background saved and ready for AI.${result.truncated ? ' Only the first 30 pages / 30,000 characters were kept; review the extracted text.' : ''}${result.links ? ` Preserved ${result.links} PDF link${result.links === 1 ? '' : 's'}.` : ''}`,
        );
      } catch (error) {
        feedback(error instanceof Error ? error.message : 'Could not load this background.', true);
      } finally {
        loadResume.disabled = fileLabel.disabled = done.disabled = false;
      }
    }
    loadResume.addEventListener('click', () => {
      void importBackground(async () => {
        const { profile } = await chrome.storage.local.get('profile'),
          data = (profile as { resumeData?: { resumeBase64?: string } } | undefined)?.resumeData
            ?.resumeBase64;
        if (typeof data !== 'string' || !data)
          throw new Error('No saved résumé found. Add one to your profile or load a PDF here.');
        if (data.length > 14_000_000) throw new Error('Choose a résumé under 10 MB.');
        const binary = atob(data.replace(/^data:[^,]*,/, ''));
        return extractResumePDF(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
      });
    });
    fileLabel.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      await importBackground(async () => {
        if (chosen.size > 10_000_000) throw new Error('Choose a file under 10 MB.');
        if (chosen.name.toLowerCase().endsWith('.pdf'))
          return extractResumePDF(new Uint8Array(await chosen.arrayBuffer()));
        const text = (await chosen.text()).replace(/\r\n?/g, '\n').trim();
        if (!text)
          throw new Error('This file has no readable text. Your saved background was kept.');
        return {
          text: text.slice(0, 30000),
          truncated: text.length > 30000,
          pagesRead: 0,
          totalPages: 0,
          links: 0,
        };
      });
      file.value = '';
    });
    save.addEventListener('click', async () => {
      clearTimeout(writingTimer);
      save.disabled = true;
      try {
        await persistWriting?.();
      } catch {
      } finally {
        save.disabled = false;
      }
    });
    contextStatus();
    writing.append(
      node(
        'p',
        'privacy',
        'Your enabled profile facts, saved answers, background, the question and relevant job text are sent to your selected provider when you press Generate. Unknown or conflicting personal facts are flagged for your input. Nothing is submitted automatically.',
      ),
    );
  }
  renderProvider();
  renderWriting();
}
if (typeof document !== 'undefined' && document.getElementById('eze-ai-settings')) {
  void mountAISettings(document.getElementById('eze-ai-settings')!).catch((error) => {
    document.getElementById('eze-ai-settings')!.textContent = error.message;
  });
}
