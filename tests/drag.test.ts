// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFieldDragController } from '../src/drag';

type Controller = ReturnType<typeof createFieldDragController>;
let host: HTMLElement;
let list: HTMLElement;
let controller: Controller;
let onDrop = vi.fn<Parameters<typeof createFieldDragController>[2]>();
let pointed: Element | null;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let pointDescriptor: PropertyDescriptor | undefined;
const rows = new Map<
  string,
  { row: HTMLElement; handle: HTMLButtonElement; value: HTMLButtonElement }
>();

function rectangle(top: number, height = 40, width = 300): DOMRect {
  return {
    x: 0,
    y: top,
    top,
    left: 0,
    width,
    height,
    bottom: top + height,
    right: width,
    toJSON: () => ({}),
  };
}

function addRow(id: string, section: string, top: number) {
  const row = document.createElement('div');
  row.dataset.fieldId = id;
  row.dataset.section = section;
  const handle = document.createElement('button');
  handle.type = 'button';
  const label = document.createElement('span');
  label.className = 'eze-field-label';
  label.textContent = `${id} label`;
  const value = document.createElement('button');
  value.textContent = 'Copy value';
  row.append(handle, label, value);
  list.append(row);
  row.getBoundingClientRect = () => rectangle(top);
  handle.setPointerCapture = vi.fn();
  handle.hasPointerCapture = vi.fn(() => true);
  handle.releasePointerCapture = vi.fn();
  controller.attach(handle, row, 'profile-at-drag-start');
  const entry = { row, handle, value };
  rows.set(id, entry);
  return entry;
}

function pointer(
  target: EventTarget,
  type: string,
  x: number,
  y: number,
  pointerId = 1,
): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperties(event, { pointerId: { value: pointerId }, isPrimary: { value: true } });
  target.dispatchEvent(event);
  return event;
}

function beginDrag(): void {
  pointer(rows.get('last')!.handle, 'pointerdown', 15, 210);
  pointed = rows.get('first')!.value;
  pointer(document, 'pointermove', 15, 130);
}

beforeEach(() => {
  document.body.replaceChildren();
  rows.clear();
  frames = new Map();
  nextFrame = 0;
  pointed = null;
  host = document.createElement('div');
  list = document.createElement('div');
  host.append(list);
  document.body.append(host);
  onDrop = vi.fn<Parameters<typeof createFieldDragController>[2]>();
  controller = createFieldDragController(list, host, onDrop);
  pointDescriptor = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
  Object.defineProperty(document, 'elementFromPoint', {
    value: vi.fn(() => pointed),
    configurable: true,
  });
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    const id = ++nextFrame;
    frames.set(id, callback);
    return id;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
    frames.delete(id);
  });
  addRow('first', 'names', 100);
  addRow('middle', 'names', 150);
  addRow('last', 'names', 200);
  addRow('salary', 'compensation', 260);
});

afterEach(() => {
  controller.destroy();
  vi.restoreAllMocks();
  document.body.replaceChildren();
  if (pointDescriptor) Object.defineProperty(document, 'elementFromPoint', pointDescriptor);
  else Reflect.deleteProperty(document, 'elementFromPoint');
});

describe('pointer field drag controller', () => {
  it('moves a handle across rows and drops relative to the row midpoint, with the captured profile', () => {
    beginDrag();
    expect(rows.get('last')!.row.classList.contains('eze-dragging')).toBe(true);
    expect(rows.get('first')!.row.classList.contains('eze-drop-after')).toBe(true);
    expect(host.querySelector('.eze-drag-ghost')?.textContent).toBe('last label');
    pointer(document, 'pointerup', 15, 130);
    expect(onDrop).toHaveBeenCalledExactlyOnceWith(
      'last',
      'first',
      'after',
      'profile-at-drag-start',
    );
    expect(host.querySelector('.eze-drag-ghost')).toBeNull();
    expect(list.querySelector('.eze-dragging,.eze-drop-after')).toBeNull();
    expect(rows.get('last')!.handle.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it('uses before when dropped above the target midpoint', () => {
    beginDrag();
    pointer(document, 'pointermove', 15, 105);
    pointer(document, 'pointerup', 15, 105);
    expect(onDrop).toHaveBeenCalledExactlyOnceWith(
      'last',
      'first',
      'before',
      'profile-at-drag-start',
    );
  });

  it('does not reorder or start dragging for a click or movement below five pixels', () => {
    pointer(rows.get('last')!.handle, 'pointerdown', 15, 210);
    pointed = rows.get('first')!.row;
    pointer(document, 'pointermove', 18, 212);
    pointer(document, 'pointerup', 18, 212);
    expect(onDrop).not.toHaveBeenCalled();
    expect(host.querySelector('.eze-drag-ghost')).toBeNull();
    expect(window.requestAnimationFrame).not.toHaveBeenCalled();
  });

  it('rejects cross-section, outside-list and source-row drop targets', () => {
    for (const target of [rows.get('salary')!.value, document.body, rows.get('last')!.value]) {
      beginDrag();
      pointed = target;
      pointer(document, 'pointermove', 20, 270);
      pointer(document, 'pointerup', 20, 270);
    }
    expect(onDrop).not.toHaveBeenCalled();
    expect(list.querySelector('.eze-drop-after,.eze-drop-before')).toBeNull();
  });

  it.each(['pointercancel', 'lostpointercapture', 'Escape', 'cancel'])(
    'cancels without saving on %s and clears feedback',
    (reason) => {
      beginDrag();
      if (reason === 'Escape')
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        );
      else if (reason === 'cancel') controller.cancel();
      else pointer(document, reason, 15, 130);
      pointer(document, 'pointerup', 15, 130);
      expect(onDrop).not.toHaveBeenCalled();
      expect(host.querySelector('.eze-drag-ghost')).toBeNull();
      expect(list.querySelector('.eze-dragging,.eze-drop-before,.eze-drop-after')).toBeNull();
      expect(frames.size).toBe(0);
    },
  );

  it('ignores other pointers and supports document events when pointer capture is unavailable', () => {
    rows.get('last')!.handle.setPointerCapture = () => {
      throw new Error('Unavailable');
    };
    beginDrag();
    pointer(document, 'pointerup', 15, 130, 9);
    expect(onDrop).not.toHaveBeenCalled();
    pointer(document, 'pointerup', 15, 130);
    expect(onDrop).toHaveBeenCalledOnce();
  });

  it('suppresses the click after a drag so the drop cannot copy an answer', () => {
    const copied = vi.fn();
    rows.get('first')!.value.addEventListener('click', copied);
    beginDrag();
    pointer(document, 'pointerup', 15, 130);
    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      detail: 1,
      clientX: 15,
      clientY: 130,
    });
    rows.get('first')!.value.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(copied).not.toHaveBeenCalled();
    rows
      .get('first')!
      .value.dispatchEvent(
        new MouseEvent('click', { bubbles: true, detail: 1, clientX: 60, clientY: 130 }),
      );
    expect(copied).toHaveBeenCalledOnce();
  });

  it('scrolls the nearest scrolling parent at the edge and cancels its animation', () => {
    list.style.overflowY = 'auto';
    list.getBoundingClientRect = () => rectangle(50, 100);
    Object.defineProperties(list, { scrollHeight: { value: 400 }, clientHeight: { value: 100 } });
    pointer(rows.get('last')!.handle, 'pointerdown', 15, 100);
    pointed = rows.get('first')!.row;
    pointer(document, 'pointermove', 15, 145);
    const [frameId, callback] = [...frames][0];
    frames.delete(frameId);
    callback(16.67);
    expect(list.scrollTop).toBeGreaterThan(0);
    expect(frames.size).toBe(1);
    controller.cancel();
    expect(frames.size).toBe(0);
  });

  it('does not commit after a source row disappears and removes listeners on destroy', () => {
    beginDrag();
    rows.get('last')!.row.remove();
    pointer(document, 'pointermove', 15, 130);
    pointer(document, 'pointerup', 15, 130);
    expect(onDrop).not.toHaveBeenCalled();
    controller.destroy();
    pointer(rows.get('middle')!.handle, 'pointerdown', 15, 160);
    pointer(document, 'pointermove', 15, 130);
    pointer(document, 'pointerup', 15, 130);
    expect(onDrop).not.toHaveBeenCalled();
    expect(host.querySelector('.eze-drag-ghost')).toBeNull();
  });
});
