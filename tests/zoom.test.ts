// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { mountZoom } from '../src/zoom';
let dispose: () => void;
beforeEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
});
afterEach(() => dispose?.());
function key(value: string, metaKey = true) {
  const event = new KeyboardEvent('keydown', {
    key: value,
    metaKey,
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(event);
  return event;
}
describe('sidebar zoom', () => {
  it('handles Command plus/minus/reset and persists across reopening', () => {
    const host = document.createElement('div');
    document.body.append(host);
    let percent = 100;
    const zoom = mountZoom(host, (value) => (percent = value));
    dispose = zoom.dispose;
    expect(key('+').defaultPrevented).toBe(true);
    expect(percent).toBe(110);
    key('=');
    expect(percent).toBe(125);
    key('-');
    expect(percent).toBe(110);
    zoom.dispose();
    const reopened = mountZoom(host, (value) => (percent = value));
    dispose = reopened.dispose;
    expect(percent).toBe(110);
    key('0');
    expect(percent).toBe(100);
  });
  it('bounds zoom and leaves ordinary typing shortcuts alone', () => {
    let percent = 100;
    const zoom = mountZoom(document.body, (value) => (percent = value));
    dispose = zoom.dispose;
    for (let n = 0; n < 20; n++) key('-');
    expect(percent).toBe(65);
    for (let n = 0; n < 30; n++) key('+');
    expect(percent).toBe(150);
    expect(key('-', false).defaultPrevented).toBe(false);
    expect(percent).toBe(150);
    expect(key('a').defaultPrevented).toBe(false);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: '-', ctrlKey: true, bubbles: true, cancelable: true }),
    );
    expect(percent).toBe(125);
  });
});
