// Local synthetic native-page preview; never included in the extension.
(() => {
  const listeners = [];
  const data = {
    autofillEnabled: true,
    dailyGoal: 10,
    appliedList: [],
    responseList: [],
    initialSyncComplete: true,
    profile: {
      profileName: 'Example profile',
      nameData: { firstName: 'Alex', lastName: 'Sharma', preferredName: false },
      contactData: {
        phoneDeviceType: 'Mobile',
        phoneCountryCode: '+91',
        email: 'alex@example.test',
        phoneNumber: '+919000000000',
      },
      addressData: {
        country: 'India',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        line1: '42 Example Road',
        line2: '',
      },
      websiteData: {
        websites: [],
        linkedin: 'https://example.test/alex',
        github: '',
        personal: '',
      },
      languageData: [],
      skillsData: ['TypeScript', 'Python'],
      jobData: [],
      educationData: [],
      employmentData: { gender: '', ethnicity: '' },
      resumeData: { fileName: '', resumeBase64: '', fileSize: 0, dateUploaded: '' },
    },
  };
  const preferencesKey = 'eze-native-preview-preferences',
    preferenceNames = ['eze.showFloatingRestore', 'eze.linkedin.disableAutoFollow'];
  const demoKey = 'eze-preview-v1',
    customKey = 'eze.customFields.v1';
  const countsKey = 'eze.applicationCountAdjustments.v1',
    countsPreviewKey = 'eze-native-preview-counts';
  data[countsKey] = JSON.parse(localStorage.getItem(countsPreviewKey) || '{}');
  window.addEventListener('storage', (event) => {
    if (event.key !== countsPreviewKey) return;
    const previous = data[countsKey];
    data[countsKey] = JSON.parse(event.newValue || '{}');
    listeners.forEach((fn) =>
      fn({ [countsKey]: { oldValue: previous, newValue: data[countsKey] } }, 'local'),
    );
  });
  const shared = () => JSON.parse(localStorage.getItem(demoKey) || '{}');
  data[customKey] = shared()[customKey] || { version: 1, profiles: {} };
  window.addEventListener('storage', (event) => {
    if (event.key !== demoKey) return;
    const before = JSON.parse(event.oldValue || '{}'),
      after = JSON.parse(event.newValue || '{}');
    data[customKey] = after[customKey];
    listeners.forEach((fn) =>
      fn({ [customKey]: { oldValue: before[customKey], newValue: after[customKey] } }, 'local'),
    );
  });
  const savedPreferences = JSON.parse(localStorage.getItem(preferencesKey) || '{}');
  for (const name of preferenceNames)
    if (typeof savedPreferences[name] === 'boolean') data[name] = savedPreferences[name];
  window.addEventListener('storage', (event) => {
    if (event.key !== preferencesKey) return;
    const saved = JSON.parse(event.newValue || '{}'),
      changes = {};
    for (const name of preferenceNames)
      if (saved[name] !== data[name]) {
        changes[name] = { oldValue: data[name], newValue: saved[name] };
        data[name] = saved[name];
      }
    listeners.forEach((fn) => fn(changes, 'local'));
  });
  const storage = {
    get(keys, callback) {
      if (typeof keys === 'function') {
        callback = keys;
        keys = null;
      }
      const values =
        keys == null
          ? { ...data }
          : typeof keys === 'object' && !Array.isArray(keys)
            ? { ...keys, ...data }
            : Object.fromEntries(
                (typeof keys === 'string' ? [keys] : keys).map((key) => [key, data[key]]),
              );
      callback?.(values);
      return Promise.resolve(values);
    },
    set(values, callback) {
      const changes = {};
      for (const [key, value] of Object.entries(values)) {
        changes[key] = { oldValue: data[key], newValue: value };
        data[key] = value;
      }
      if (preferenceNames.some((name) => name in values))
        localStorage.setItem(
          preferencesKey,
          JSON.stringify(
            Object.fromEntries(preferenceNames.map((name) => [name, data[name] === true])),
          ),
        );
      if (countsKey in values)
        localStorage.setItem(countsPreviewKey, JSON.stringify(values[countsKey]));
      listeners.forEach((fn) => fn(changes, 'local'));
      callback?.();
      return Promise.resolve();
    },
    remove(keys, callback) {
      for (const key of typeof keys === 'string' ? [keys] : keys) delete data[key];
      callback?.();
      return Promise.resolve();
    },
  };
  const event = { addListener() {}, removeListener() {} };
  window.chrome = {
    runtime: {
      id: 'local-test-only',
      getURL: (path) => '/' + path.replace(/^\//, ''),
      getManifest: () => ({ version: '3.0.0', version_name: 'EZEapply 3.0.0 preview' }),
      onMessage: event,
      sendMessage: async (message) => {
        if (message.type === 'eze-app:save-profile')
          await storage.set({ profile: message.profile });
        if (message.type === 'eze-app:autofill')
          await storage.set({ autofillEnabled: message.enabled });
        if (message.type === 'eze-app:stage')
          await storage.set({
            'eze.applicationStages.v1': {
              ...(data['eze.applicationStages.v1'] || {}),
              [message.id]: message.stage,
            },
          });
        if (message.type === 'eze-custom:adjust-count') {
          const now = new Date(),
            day = [
              now.getFullYear(),
              String(now.getMonth() + 1).padStart(2, '0'),
              String(now.getDate()).padStart(2, '0'),
            ].join('-');
          if (message.day !== day || ![1, -1].includes(message.delta))
            return { error: 'Reopen the popup and try again.' };
          const corrections = { ...data[countsKey] },
            start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime(),
            end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
          const detected = data.appliedList.filter(
            (item) => new Date(item.date).getTime() >= start && new Date(item.date).getTime() < end,
          ).length;
          corrections[day] = Math.max(-detected, (corrections[day] || 0) + message.delta);
          await storage.set({ [countsKey]: corrections });
          return { ok: true, count: Math.max(0, detected + corrections[day]) };
        }
        if (message.type === 'eze-custom:auto-fill') {
          if (message.profileId !== 'local') return { error: 'Your profile changed. Try again.' };
          const demo = shared(),
            store = demo[customKey] || { version: 1, profiles: {} };
          store.profiles.local = {
            ...(store.profiles.local || { fields: [], autoFill: true }),
            autoFill: message.enabled,
          };
          localStorage.setItem(demoKey, JSON.stringify({ ...demo, [customKey]: store }));
          await storage.set({ [customKey]: store });
        }
        if (message.type === 'eze-custom:save') {
          const demo = shared(),
            store = demo[customKey] || { version: 1, profiles: {} };
          store.profiles[message.profileId] = message.profile;
          localStorage.setItem(demoKey, JSON.stringify({ ...demo, [customKey]: store }));
          await storage.set({ [customKey]: store });
        }
        return { ok: true };
      },
      openOptionsPage: () => window.open('/native.html'),
      lastError: undefined,
    },
    storage: {
      local: storage,
      session: storage,
      onChanged: {
        addListener: (fn) => listeners.push(fn),
        removeListener: (fn) => listeners.splice(listeners.indexOf(fn), 1),
      },
    },
    tabs: { create: async ({ url }) => window.open(url), query: async () => [] },
    sidePanel: { open: async () => {} },
    windows: { getCurrent: async () => ({ id: 1 }) },
    action: {},
  };
})();
