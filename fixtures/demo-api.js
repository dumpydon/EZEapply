// Local test fixture only. This file is never packaged into the extension.
(() => {
  const key = 'eze-preview-v1';
  const defaultData = {
    profile: {
      nameData: { firstName: 'Alex', middleName: '', lastName: 'Sharma' },
      contactData: {
        phoneNumber: '+919000000000',
        phoneCountryCode: '',
        email: 'alex@example.test',
      },
      addressData: {
        line1: '42 Example Road',
        line2: 'Suite 5',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        country: 'India',
      },
      websiteData: {
        linkedin: 'https://www.linkedin.com/in/alex-example/',
        github: 'https://github.com/alex-example',
        personal: 'https://alex.example.test',
      },
      skillsData: ['TypeScript', 'Python'],
      resumeData: {
        fileName: 'Alex-example-resume.pdf',
        resumeBase64: btoa('%PDF-1.4\nSynthetic EZEapply test resume.\n%%EOF'),
      },
    },
    'eze.customFields.v1': {
      version: 1,
      profiles: {
        local: {
          autoFill: false,
          fields: [
            {
              id: 'demo-expected',
              label: 'Expected compensation',
              value: '1200000',
              aliases: ['expected salary', 'salary expectations'],
              exclude: ['current', 'previous'],
              category: 'Compensation',
              enabled: true,
              matchMode: 'phrase',
              scope: '',
            },
            {
              id: 'demo-notice',
              label: 'Notice period',
              value: '30 days',
              aliases: ['notice period', 'when can you start'],
              exclude: [],
              category: 'Personal questions',
              enabled: true,
              matchMode: 'phrase',
              scope: '',
            },
            {
              id: 'demo-relocate',
              label: 'Willing to relocate',
              value: 'Yes',
              aliases: ['are you willing to relocate'],
              exclude: [],
              category: 'Personal questions',
              enabled: true,
              matchMode: 'phrase',
              scope: '',
            },
          ],
        },
      },
    },
  };
  if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(defaultData));
  // Fixture-only migration; does not run in the packaged extension or user data.
  const demo = JSON.parse(localStorage.getItem(key));
  demo.profile = defaultData.profile;
  const library = demo['eze.customFields.v1'].profiles.local;
  const expectedDemo = library.fields.find((field) => field.id === 'demo-expected');
  if (expectedDemo)
    expectedDemo.aliases = expectedDemo.aliases.filter(
      (alias) => alias.toLowerCase() !== 'expected ctc',
    );
  for (const item of [
    {
      id: 'demo-prefix',
      label: 'prefix*',
      value: 'mR.',
      category: 'Personal questions',
      aliases: [],
      exclude: [],
      enabled: true,
      matchMode: 'phrase',
      scope: '',
    },
    {
      id: 'demo-gender',
      label: 'Gender *',
      value: 'Male',
      category: 'Personal questions',
      aliases: [],
      exclude: [],
      enabled: true,
      matchMode: 'phrase',
      scope: '',
    },
    {
      id: 'demo-long-notice',
      label: 'Please enter your notice period in days',
      value: '10',
      category: 'Personal questions',
      aliases: [],
      exclude: [],
      enabled: true,
      matchMode: 'exact',
      scope: '',
    },
    {
      id: 'demo-long-months',
      label: 'Please select your total additional months of experience:*',
      value: '3',
      category: 'Personal questions',
      aliases: [],
      exclude: [],
      enabled: true,
      matchMode: 'exact',
      scope: '',
    },
    {
      id: 'demo-ctc-default',
      label: 'Your expected CTC',
      value: '8',
      category: 'Compensation',
      aliases: [],
      exclude: ['current'],
      enabled: true,
      matchMode: 'phrase',
      scope: '',
    },
    {
      id: 'demo-ctc-inr',
      label: 'Please enter your expected CTC in INR',
      value: '800000',
      category: 'Compensation',
      aliases: [],
      exclude: ['current'],
      enabled: true,
      matchMode: 'phrase',
      scope: '',
    },
    {
      id: 'demo-ctc-lpa',
      label: 'Expected CTC in lakhs',
      value: '8.5',
      category: 'Compensation',
      aliases: [],
      exclude: ['current'],
      enabled: true,
      matchMode: 'phrase',
      scope: '',
    },
    {
      id: 'demo-current-lacs',
      label: 'What is your Current CTC? (In Lacs)',
      value: '7.5',
      category: 'Compensation',
      aliases: [],
      exclude: ['expected'],
      enabled: true,
      matchMode: 'phrase',
      scope: '',
    },
    {
      id: 'demo-current-inr',
      label: 'Please enter your current CTC in INR',
      value: '750000',
      category: 'Compensation',
      aliases: [],
      exclude: ['expected'],
      enabled: true,
      matchMode: 'phrase',
      scope: '',
    },
    {
      id: 'demo-total-experience',
      label: 'Total years of professional experience',
      value: '3',
      category: 'Experience',
      aliases: [],
      exclude: [],
      enabled: true,
      matchMode: 'phrase',
      scope: '',
    },
    {
      id: 'demo-college-name',
      label: 'School or college name',
      value: 'Example University',
      category: 'Education',
      aliases: [],
      exclude: [],
      enabled: true,
      matchMode: 'phrase',
      scope: '',
    },
    {
      id: 'demo-python-experience',
      label: 'Python experience in years',
      value: '2',
      category: 'Experience',
      aliases: [],
      exclude: [],
      enabled: true,
      matchMode: 'phrase',
      scope: '',
    },
  ])
    if (!library.fields.some((field) => field.id === item.id)) library.fields.push(item);
  // Keep the fixture's duplicated notice-layout example consistent with its
  // original selectable notice answer; this never runs on extension storage.
  const noticeDemo = library.fields.find((field) => field.id === 'demo-notice');
  const longNoticeDemo = library.fields.find((field) => field.id === 'demo-long-notice');
  if (noticeDemo && longNoticeDemo) longNoticeDemo.value = noticeDemo.value;
  localStorage.setItem(key, JSON.stringify(demo));
  const changes = [];
  const listeners = [];
  const read = () => JSON.parse(localStorage.getItem(key));
  function notify(before, after) {
    const diff = {};
    for (const name of new Set([...Object.keys(before), ...Object.keys(after)]))
      if (JSON.stringify(before[name]) !== JSON.stringify(after[name]))
        diff[name] = { oldValue: before[name], newValue: after[name] };
    changes.forEach((listener) => listener(diff, 'local'));
  }
  window.addEventListener('storage', (event) => {
    if (event.key === key)
      notify(JSON.parse(event.oldValue || '{}'), JSON.parse(event.newValue || '{}'));
  });
  window.EZE_DEMO = {
    receive(message) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('The test form did not respond.')), 5000);
        const respond = (value) => {
          clearTimeout(timer);
          resolve(value);
        };
        listeners.forEach((listener) => listener(message, {}, respond));
      });
    },
  };
  window.chrome = {
    storage: {
      local: {
        async get(keys) {
          const data = read();
          if (!keys) return data;
          return Object.fromEntries(
            (typeof keys === 'string' ? [keys] : keys).map((name) => [name, data[name]]),
          );
        },
        async set(values) {
          const before = read();
          const after = { ...before, ...values };
          localStorage.setItem(key, JSON.stringify(after));
          notify(before, after);
        },
      },
      onChanged: {
        addListener(fn) {
          changes.push(fn);
        },
        removeListener(fn) {
          const index = changes.indexOf(fn);
          if (index >= 0) changes.splice(index, 1);
        },
      },
    },
    runtime: {
      id: 'local-test-only',
      onMessage: {
        addListener(fn) {
          listeners.push(fn);
        },
        removeListener(fn) {
          const index = listeners.indexOf(fn);
          if (index >= 0) listeners.splice(index, 1);
        },
      },
      async sendMessage(message) {
        if (message.type === 'eze-custom:auto-fill') {
          const data = read(),
            id = data.lastSyncProfile?.id || 'local';
          if (message.profileId !== id) return { error: 'Your profile changed. Try again.' };
          const store = data['eze.customFields.v1'];
          store.profiles[id] = {
            ...(store.profiles[id] || { fields: [], autoFill: true }),
            autoFill: message.enabled,
          };
          await window.chrome.storage.local.set({ 'eze.customFields.v1': store });
          return { ok: true };
        }
        if (message.type === 'eze-custom:save') {
          const data = read();
          const store = data['eze.customFields.v1'];
          store.profiles[message.profileId] = message.profile;
          await window.chrome.storage.local.set({ 'eze.customFields.v1': store });
          return { ok: true };
        }
        if (message.type === 'eze-custom:dispatch') {
          const form = window.parent.document.getElementById('application');
          if (!form) return { error: 'Open the full compatibility workspace to run this action.' };
          const frames = [
            form.contentWindow,
            ...[...form.contentDocument.querySelectorAll('iframe')].map(
              (frame) => frame.contentWindow,
            ),
          ];
          const reports = await Promise.all(
            frames.map(async (frame, index) => {
              const report = await frame.EZE_DEMO.receive({ type: `eze-custom:${message.action}` });
              return {
                ...report,
                questions: report.questions.map((question) => ({
                  ...question,
                  id: `${index}:${question.id}`,
                  documentId: `preview-document-${index}`,
                })),
              };
            }),
          );
          return {
            tabId: 1,
            filled: reports.reduce((sum, r) => sum + r.filled, 0),
            skipped: reports.reduce((sum, r) => sum + r.skipped, 0),
            questions: reports.flatMap((r) => r.questions),
            warnings: reports.flatMap((r) => r.warnings || []),
            ...(reports.some((r) => r.error)
              ? {
                  error: reports
                    .map((r) => r.error)
                    .filter(Boolean)
                    .join(' '),
                }
              : {}),
          };
        }
        if (message.type === 'eze-custom:open-ai') {
          const form = window.parent.document.getElementById('application');
          if (!form) return { error: 'Open the full compatibility workspace first.' };
          const frames = [
            form.contentWindow,
            ...[...form.contentDocument.querySelectorAll('iframe')].map(
              (frame) => frame.contentWindow,
            ),
          ];
          const parts = /^(\d+):(.+)$/.exec(message.questionId || '');
          if (message.tabId !== 1 || !parts || !frames[Number(parts[1])])
            return { error: 'Find questions again in the preview.' };
          return frames[Number(parts[1])].EZE_DEMO.receive({
            type: 'eze-custom:open-ai',
            questionId: parts[2],
            questionLabel: message.questionLabel,
          });
        }
        if (message.type === 'eze-custom:hide-panel') {
          const wrapper = window.parent.document;
          wrapper.getElementById('panel').style.display = 'none';
          wrapper.querySelector('main').style.gridTemplateColumns = '1fr';
          const toolbarButton = wrapper.getElementById('preview-show-panel');
          const reopen = () => {
            wrapper.getElementById('panel').style.display = '';
            wrapper.querySelector('main').style.gridTemplateColumns = '';
            wrapper.getElementById('demo-restore-panel')?.remove();
            if (toolbarButton) toolbarButton.hidden = true;
          };
          if (toolbarButton) {
            toolbarButton.hidden = false;
            toolbarButton.onclick = reopen;
          }
          wrapper.getElementById('demo-restore-panel')?.remove();
          if (read()['eze.showFloatingRestore'] !== true) return { ok: true };
          const button = wrapper.createElement('button');
          button.textContent = '‹ EZEapply';
          button.id = 'demo-restore-panel';
          button.style.cssText =
            'position:fixed;bottom:20px;right:14px;background:#167f70;color:white;padding:9px 13px;border:0;border-radius:20px;z-index:9999;cursor:pointer';
          button.addEventListener('click', reopen);
          wrapper.body.append(button);
          return { ok: true };
        }
        return { ok: true };
      },
    },
  };
})();
