// Test fixture only: UI behavior and verification are independent of the autofill engine.
(() => {
  if (!document.body.hasAttribute('data-compatibility-form')) return;
  const get = (id) => document.getElementById(id);
  const nativeValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  const frameworkInput = get('framework-first');
  let tracked = '';
  let frameworkState = '';
  Object.defineProperty(frameworkInput, 'value', {
    configurable: true,
    get() {
      return nativeValue.get.call(this);
    },
    set(next) {
      tracked = String(next);
      nativeValue.set.call(this, next);
    },
  });
  frameworkInput.addEventListener('input', () => {
    const current = nativeValue.get.call(frameworkInput);
    if (current === tracked) return;
    tracked = current;
    frameworkState = current;
    get('framework-state').textContent = `Framework state: ${current}`;
  });

  const shadow = get('shadow-host').attachShadow({ mode: 'open' });
  const shadowStyle = document.createElement('style');
  shadowStyle.textContent =
    'label{display:grid;gap:6px;color:#4d5a70;font:600 12px/1.5 -apple-system,sans-serif}input{font:400 14px/1.45 -apple-system,sans-serif;padding:10px 11px;border:1px solid #bdc9d8;border-radius:7px;color:#28354c;background:white}';
  const shadowLabel = document.createElement('label');
  shadowLabel.textContent = 'Email address';
  const shadowInput = document.createElement('input');
  shadowInput.id = 'shadow-email';
  shadowInput.type = 'email';
  shadowInput.autocomplete = 'email';
  shadowLabel.append(shadowInput);
  shadow.append(shadowStyle, shadowLabel);

  function setupCountryCombo(inputId, listId, editable) {
    const input = get(inputId),
      list = get(listId);
    let selected = '';
    let timer;
    function render() {
      list.replaceChildren();
      const search = editable ? input.value.toLowerCase() : '';
      for (const [code, name] of [
        ['IN', 'India'],
        ['US', 'United States'],
        ['DE', 'Germany'],
      ]) {
        if (search && !name.toLowerCase().includes(search) && !code.toLowerCase().includes(search))
          continue;
        const option = document.createElement('div');
        option.id = `${listId}-${code}`;
        option.role = 'option';
        option.textContent = name;
        option.setAttribute('aria-selected', String(selected === name));
        option.addEventListener('click', () => {
          selected = name;
          input.dataset.selectedValue = code;
          if (editable) nativeValue.set.call(input, name);
          else input.textContent = name;
          list
            .querySelectorAll('[role=option]')
            .forEach((item) => item.setAttribute('aria-selected', String(item === option)));
          input.setAttribute('aria-expanded', 'false');
          list.hidden = true;
          input.dispatchEvent(new Event('change', { bubbles: true }));
        });
        list.append(option);
      }
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    function open() {
      clearTimeout(timer);
      timer = setTimeout(render, editable ? 120 : 0);
    }
    input.addEventListener('click', open);
    if (editable) input.addEventListener('input', open);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        clearTimeout(timer);
        list.hidden = true;
        input.setAttribute('aria-expanded', 'false');
      }
    });
    return () => selected;
  }
  const searchSelection = setupCountryCombo('search-country', 'search-country-options', true);
  const buttonSelection = setupCountryCombo('button-country', 'button-country-options', false);
  let resumeChange = false;
  function fileBadge(input, output) {
    const file = input.files?.[0];
    output.textContent = file ? `${file.name} · ${file.size} bytes` : 'No file selected';
  }
  get('choose-resume').addEventListener('click', () => get('resume-upload').click());
  get('resume-upload').addEventListener('change', () => {
    resumeChange = true;
    fileBadge(get('resume-upload'), get('resume-badge'));
  });
  get('cover-upload').addEventListener('change', () =>
    fileBadge(get('cover-upload'), get('cover-badge')),
  );
  document.querySelector('form').addEventListener('submit', (event) => event.preventDefault());
  get('reveal-step').addEventListener('click', () => {
    if (get('delayed-phone')) return;
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = 'Application step added after initial load';
    const label = document.createElement('label');
    label.textContent = 'Phone number without country code';
    const input = document.createElement('input');
    input.id = 'delayed-phone';
    input.type = 'tel';
    label.append(input);
    fieldset.append(legend, label);
    get('dynamic-step').append(fieldset);
    get('reveal-step').textContent = 'Additional step visible';
  });

  function checks() {
    const value = (id) => get(id)?.value?.trim() || '';
    const entries = [];
    const add = (label, ok, detail = '') => entries.push({ label, ok, detail });
    add('Autocomplete-only first name', value('opaque-71') === 'Alex');
    add('Autocomplete-only last name', value('opaque-72') === 'Sharma');
    add('Autocomplete-only email', value('opaque-73') === 'alex@example.test');
    add('Autocomplete-only street address', value('opaque-74') === '42 Example Road');
    add('Wrapped address line 2', value('wrapped-address2') === 'Suite 5');
    add('Wrapped city', value('wrapped-city') === 'Bengaluru');
    add('Wrapped state', value('wrapped-state') === 'Karnataka');
    add('Wrapped postal code', value('wrapped-postal') === '560001');
    add('Native country option by ISO value', value('native-country') === 'IN');
    add('National phone', value('national-phone') === '9000000000');
    add('LinkedIn URL', value('profile-linkedin') === 'https://www.linkedin.com/in/alex-example/');
    add('GitHub URL', value('profile-github') === 'https://github.com/alex-example');
    add('Personal website', value('profile-website') === 'https://alex.example.test');
    const skills = value('profile-skills')
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .sort();
    add('Saved skills', JSON.stringify(skills) === JSON.stringify(['Python', 'TypeScript']));
    add(
      'Framework-like state accepted input',
      frameworkState === 'Alex' && value('framework-first') === 'Alex',
    );
    add('Custom expected compensation', value('expected-salary') === '1200000');
    add(
      'Delayed editable dropdown committed option',
      searchSelection() === 'India' && get('search-country').dataset.selectedValue === 'IN',
    );
    add(
      'Button dropdown committed option',
      buttonSelection() === 'India' && get('button-country').dataset.selectedValue === 'IN',
    );
    add('Contenteditable custom answer', get('editable-notice').textContent.trim() === '30 days');
    const resume = get('resume-upload').files?.[0];
    add(
      'Resume FileList and change event',
      Boolean(resume && /\.pdf$/i.test(resume.name) && resume.size > 0 && resumeChange),
      resume ? resume.name : 'Use Attach resume',
    );
    add('Cover letter left untouched', get('cover-upload').files.length === 0);
    add('Open-shadow-root email', shadowInput.value === 'alex@example.test');
    const embedded = get('embedded-application').contentDocument;
    add(
      'Embedded-frame email',
      embedded?.getElementById('frame-email')?.value === 'alex@example.test',
    );
    add('Embedded-frame city', embedded?.getElementById('frame-city')?.value === 'Bengaluru');
    add('Existing email preserved', value('existing-email') === 'existing-answer@example.test');
    add('Consent left unchecked', !get('consent').checked);
    add(
      'Dynamically inserted phone',
      get('delayed-phone') ? value('delayed-phone') === '9000000000' : null,
      get('delayed-phone') ? '' : 'Reveal another application step',
    );
    return entries;
  }
  get('check-results').addEventListener('click', () => {
    const entries = checks();
    const passed = entries.filter((entry) => entry.ok === true).length;
    const pending = entries.filter((entry) => entry.ok === null).length;
    get('result-summary').textContent = `${passed} / ${entries.length} fixture checks passed`;
    get('result-detail').textContent =
      `${pending ? `${pending} scenario still needs to be revealed. ` : ''}This score covers synthetic DOM patterns only. It is not a measured percentage of employer websites supported.`;
    const list = get('result-list');
    list.replaceChildren();
    for (const entry of entries) {
      const item = document.createElement('li');
      item.className = entry.ok === null ? 'pending' : entry.ok ? 'pass' : 'fail';
      item.textContent = `${entry.ok === null ? '○' : entry.ok ? '✓' : '·'} ${entry.label}${entry.detail ? ` — ${entry.detail}` : ''}`;
      list.append(item);
    }
  });
})();
