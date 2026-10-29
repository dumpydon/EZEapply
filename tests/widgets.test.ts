// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { comboboxValue, fillCombobox } from '../src/widgets';

beforeEach(() => {
  document.body.replaceChildren();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});
async function finish<T>(promise: Promise<T>): Promise<T> {
  await vi.runAllTimersAsync();
  return promise;
}
function editable(): HTMLInputElement {
  document.body.innerHTML =
    '<label for="city">City</label><input id="city" role="combobox" aria-expanded="false" aria-controls="cities"><div id="cities" role="listbox" hidden><div role="option">Delhi</div><div role="option">Mumbai</div></div>';
  const input = document.getElementById('city') as HTMLInputElement;
  const list = document.getElementById('cities')!;
  input.addEventListener('click', () => {
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  });
  list.querySelectorAll<HTMLElement>('[role=option]').forEach((option) =>
    option.addEventListener('click', () => {
      input.value = option.textContent!;
      input.setAttribute('aria-expanded', 'false');
      option.setAttribute('aria-selected', 'true');
      list.hidden = true;
    }),
  );
  return input;
}

describe('scoped ARIA dropdown adapter', () => {
  it('cancels a delayed search without selecting an option or leaving its own search text behind', async () => {
    const input = editable(),
      list = document.getElementById('cities')!;
    list.replaceChildren();
    const choose = vi.fn(),
      controller = new AbortController();
    input.addEventListener('input', () => {
      if (input.value === 'Delhi')
        setTimeout(() => {
          const option = document.createElement('div');
          option.role = 'option';
          option.textContent = 'Delhi';
          option.addEventListener('click', choose);
          list.append(option);
        }, 300);
    });
    const result = fillCombobox(input, 'Delhi', [], controller.signal);
    await vi.advanceTimersByTimeAsync(80);
    expect(input.value).toBe('Delhi');
    controller.abort();
    expect((await finish(result)).reason).toContain('stopped');
    expect(input.value).toBe('');
    expect(choose).not.toHaveBeenCalled();
  });
  it('selects an exact linked option using the widget handler', async () => {
    const input = editable();
    const result = await finish(fillCombobox(input, 'Delhi'));
    expect(result.filled).toBe(true);
    expect(input.value).toBe('Delhi');
  });
  it('supports ISO aliases without substring guessing', async () => {
    const input = editable();
    document.querySelector('[role=option]')!.textContent = 'IN';
    expect((await finish(fillCombobox(input, 'India', ['IN']))).filled).toBe(true);
    expect(input.value).toBe('IN');
  });
  it('preserves an existing choice and an unfinished user search', async () => {
    const input = editable();
    input.value = 'Mum';
    const click = vi.spyOn(input, 'click');
    expect((await finish(fillCombobox(input, 'Delhi'))).reason).toContain('preserved');
    expect(click).not.toHaveBeenCalled();
  });
  it('searches asynchronous linked options and confirms an actual click', async () => {
    const input = editable();
    const list = document.getElementById('cities')!;
    list.replaceChildren();
    input.addEventListener('input', () => {
      if (input.value === 'Delhi')
        setTimeout(() => {
          const option = document.createElement('div');
          option.role = 'option';
          option.textContent = 'Delhi';
          option.addEventListener('click', () => {
            option.setAttribute('aria-selected', 'true');
            input.setAttribute('aria-expanded', 'false');
          });
          list.append(option);
        }, 80);
    });
    expect((await finish(fillCombobox(input, 'Delhi'))).filled).toBe(true);
  });
  it('does not fill a lookalike option or count search text as success', async () => {
    const input = editable();
    document.getElementById('cities')!.innerHTML = '<div role="option">New Delhi NCR</div>';
    const result = await finish(fillCombobox(input, 'Delhi'));
    expect(result.filled).toBe(false);
    expect(input.value).toBe('');
  });
  it('does not select any unrelated global listbox', async () => {
    const input = editable();
    input.setAttribute('aria-controls', 'missing');
    const handler = vi.fn();
    document.querySelector('[role=option]')!.addEventListener('click', handler);
    const result = await finish(fillCombobox(input, 'Delhi'));
    expect(result.filled).toBe(false);
    expect(handler).not.toHaveBeenCalled();
    expect(input.value).toBe('');
  });
  it('leaves ambiguous and disabled options alone', async () => {
    const input = editable();
    const list = document.getElementById('cities')!;
    list.innerHTML = '<div role="option">Delhi</div><div role="option">Delhi</div>';
    expect((await finish(fillCombobox(input, 'Delhi'))).reason).toContain('More than one');
    list.innerHTML = '<div role="option" aria-disabled="true">Delhi</div>';
    expect((await finish(fillCombobox(input, 'Delhi'))).filled).toBe(false);
  });
  it('rejects click handlers that neither select nor confirm the option', async () => {
    const input = editable();
    document.getElementById('cities')!.innerHTML = '<div role="option">Delhi</div>';
    expect((await finish(fillCombobox(input, 'Delhi'))).reason).toContain('did not confirm');
    expect(input.value).toBe('');
  });
  it('handles select-only controls and avoids submitting a form', async () => {
    document.body.innerHTML =
      '<button type="button" role="combobox" aria-controls="options" aria-expanded="false">Select an option</button><div id="options" role="listbox"><div role="option">India</div></div>';
    const button = document.querySelector('button')!;
    document.querySelector('[role=option]')!.addEventListener('click', () => {
      button.textContent = 'India';
      button.setAttribute('aria-expanded', 'false');
    });
    expect((await finish(fillCombobox(button, 'India'))).filled).toBe(true);
    document.body.innerHTML = '<form><button role="combobox">Select</button></form>';
    expect(
      (await finish(fillCombobox(document.querySelector('button')!, 'India'))).reason,
    ).toContain('submit');
  });
  it('resolves linked options inside open shadow roots', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML =
      '<div role="combobox" tabindex="0" aria-controls="choices">Choose</div><div id="choices" role="listbox"><div role="option">Yes</div></div>';
    const control = shadow.querySelector<HTMLElement>('[role=combobox]')!;
    shadow.querySelector('[role=option]')!.addEventListener('click', () => {
      control.textContent = 'Yes';
    });
    expect((await finish(fillCombobox(control, 'Yes'))).filled).toBe(true);
  });
  it('recognizes a selected React Select single value outside the search input', () => {
    document.body.innerHTML =
      '<div class="react-select__control"><span class="react-select__single-value">India</span><input role="combobox"></div>';
    expect(comboboxValue(document.querySelector('input')!)).toBe('India');
  });
  it('does not select multiple-choice listboxes or hidden controls', async () => {
    const input = editable();
    document.getElementById('cities')!.setAttribute('aria-multiselectable', 'true');
    expect((await finish(fillCombobox(input, 'Delhi'))).reason).toContain('Multiple-choice');
    input.hidden = true;
    expect((await finish(fillCombobox(input, 'Delhi'))).reason).toContain('not available');
  });
  it.each(['<button role="option">Delhi</button>', '<a role="option" href="/submit">Delhi</a>'])(
    'does not activate an option that could submit or navigate: %s',
    async (html) => {
      const input = editable(),
        form = document.createElement('form');
      document.body.append(form);
      form.append(document.getElementById('cities')!);
      document.getElementById('cities')!.innerHTML = html;
      const option = document.querySelector('[role="option"]')!,
        click = vi.fn(),
        submit = vi.fn();
      option.addEventListener('click', click);
      form.addEventListener('submit', submit);
      expect((await finish(fillCombobox(input, 'Delhi'))).reason).toContain(
        'could submit or navigate',
      );
      expect(click).not.toHaveBeenCalled();
      expect(submit).not.toHaveBeenCalled();
    },
  );
});
