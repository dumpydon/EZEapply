type Position = 'before' | 'after';
type DropTarget = { row: HTMLElement; id: string; position: Position };
type DragState = {
  handle: HTMLButtonElement;
  row: HTMLElement;
  sourceId: string;
  section: string;
  profileId: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  started: boolean;
  target: DropTarget | null;
  ghost: HTMLDivElement | null;
  scrollContainers: HTMLElement[];
};

/** Pointer-based ordering stays inside one section. It deliberately does not
 * use native HTML drag, whose text selection and iframe behavior vary by host. */
export function createFieldDragController(
  list: HTMLElement,
  host: HTMLElement,
  onDrop: (sourceId: string, targetId: string, position: Position, profileId: string) => void,
): {
  attach(handle: HTMLButtonElement, row: HTMLElement, profileId: string): void;
  cancel(): void;
  destroy(): void;
} {
  const document = list.ownerDocument;
  const window = document.defaultView!;
  const attached = new WeakSet<HTMLButtonElement>();
  let active: DragState | null = null;
  let destroyed = false;
  let animation: number | undefined;
  let previousFrame: number | undefined;
  let suppressedClick: { x: number; y: number; until: number } | undefined;

  function clearTarget(state: DragState): void {
    state.target?.row.classList.remove('eze-drop-before', 'eze-drop-after');
    state.target = null;
  }

  function updateTarget(state: DragState): void {
    const pointed = document.elementFromPoint(state.x, state.y);
    const row = pointed?.closest<HTMLElement>('[data-field-id]');
    if (
      !row ||
      !list.contains(row) ||
      row === state.row ||
      row.dataset.section !== state.section ||
      !row.dataset.fieldId
    ) {
      clearTarget(state);
      return;
    }
    const bounds = row.getBoundingClientRect();
    const position: Position = state.y < bounds.top + bounds.height / 2 ? 'before' : 'after';
    if (state.target?.row !== row || state.target.position !== position) {
      clearTarget(state);
      state.target = { row, id: row.dataset.fieldId, position };
      row.classList.add(`eze-drop-${position}`);
    }
  }

  function scrollingAncestors(): HTMLElement[] {
    const result: HTMLElement[] = [];
    const page = document.scrollingElement as HTMLElement | null;
    for (let node: HTMLElement | null = list; node; node = node.parentElement) {
      if (
        node !== page &&
        /auto|scroll/.test(window.getComputedStyle(node).overflowY) &&
        node.scrollHeight > node.clientHeight
      )
        result.push(node);
    }
    if (page) result.push(page);
    return result;
  }

  function scrollFrame(time: number): void {
    animation = undefined;
    const state = active;
    if (!state?.started) return;
    if (!state.row.isConnected || !list.isConnected) {
      cancel();
      return;
    }
    const elapsed =
      previousFrame === undefined ? 16.67 : Math.min(32, Math.max(0, time - previousFrame));
    previousFrame = time;
    for (const container of state.scrollContainers) {
      const isPage = container === document.scrollingElement;
      const rect = isPage
        ? { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }
        : container.getBoundingClientRect();
      const top = Math.max(0, rect.top);
      const bottom = Math.min(window.innerHeight, rect.bottom);
      if (bottom <= top || state.x < rect.left || state.x > rect.right) continue;
      const edge = Math.min(40, (bottom - top) / 3);
      let velocity = 0;
      if (state.y < top + edge) velocity = -Math.min(1, (top + edge - state.y) / edge);
      else if (state.y > bottom - edge) velocity = Math.min(1, (state.y - bottom + edge) / edge);
      if (!velocity) continue;
      const maximum = Math.max(0, container.scrollHeight - container.clientHeight);
      const next = Math.min(maximum, Math.max(0, container.scrollTop + velocity * elapsed * 0.85));
      if (next === container.scrollTop) continue;
      container.scrollTop = next;
      updateTarget(state);
      break;
    }
    animation = window.requestAnimationFrame(scrollFrame);
  }

  function moveGhost(state: DragState): void {
    if (!state.ghost) return;
    const scale = Number.parseFloat(window.getComputedStyle(document.body).zoom) || 1;
    state.ghost.style.left = `${Math.max(8, Math.min(state.x + 14, window.innerWidth - 170)) / scale}px`;
    state.ghost.style.top = `${Math.max(8, Math.min(state.y + 14, window.innerHeight - 42)) / scale}px`;
  }

  function start(state: DragState): void {
    state.started = true;
    state.row.classList.add('eze-dragging');
    const ghost = document.createElement('div');
    ghost.className = 'eze-drag-ghost';
    ghost.textContent = state.row.querySelector('.eze-field-label')?.textContent || state.sourceId;
    ghost.setAttribute('aria-hidden', 'true');
    // Position and hit-testing are behavioral; appearance lives in panel.css.
    ghost.style.cssText =
      'position:fixed;pointer-events:none;z-index:2147483647;max-width:160px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis';
    host.append(ghost);
    state.ghost = ghost;
    moveGhost(state);
    animation = window.requestAnimationFrame(scrollFrame);
  }

  function finish(): DragState | null {
    const state = active;
    active = null;
    if (animation !== undefined) window.cancelAnimationFrame(animation);
    animation = undefined;
    previousFrame = undefined;
    if (!state) return null;
    if (state.started)
      suppressedClick = { x: state.x, y: state.y, until: window.performance.now() + 350 };
    state.row.classList.remove('eze-dragging');
    state.ghost?.remove();
    try {
      if (state.handle.hasPointerCapture?.(state.pointerId))
        state.handle.releasePointerCapture(state.pointerId);
    } catch {
      /* A removed handle may already have lost capture. */
    }
    return state;
  }

  function cancel(): void {
    const state = finish();
    if (state) clearTarget(state);
  }

  function onPointerMove(event: PointerEvent): void {
    const state = active;
    if (!state || state.pointerId !== event.pointerId) return;
    if (!state.row.isConnected || !list.isConnected) {
      cancel();
      return;
    }
    state.x = event.clientX;
    state.y = event.clientY;
    if (!state.started && Math.hypot(state.x - state.startX, state.y - state.startY) < 5) return;
    if (!state.started) start(state);
    event.preventDefault();
    moveGhost(state);
    updateTarget(state);
  }

  function onPointerUp(event: PointerEvent): void {
    const state = active;
    if (!state || state.pointerId !== event.pointerId) return;
    state.x = event.clientX;
    state.y = event.clientY;
    if (state.started) {
      event.preventDefault();
      updateTarget(state);
    }
    const target = state.target;
    const canDrop =
      state.started &&
      state.row.isConnected &&
      target?.row.isConnected &&
      list.contains(target.row);
    finish();
    clearTarget(state);
    if (canDrop && target) onDrop(state.sourceId, target.id, target.position, state.profileId);
  }

  function onPointerCancel(event: PointerEvent): void {
    if (active?.pointerId === event.pointerId) cancel();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (active && event.key === 'Escape') {
      event.preventDefault();
      cancel();
    }
  }

  function onClick(event: MouseEvent): void {
    // A native click follows pointerup. Do not let that click copy an answer if
    // a successful drop rerendered the row underneath the pointer.
    if (!suppressedClick || window.performance.now() > suppressedClick.until) {
      suppressedClick = undefined;
      return;
    }
    if (
      event.detail > 0 &&
      Math.hypot(event.clientX - suppressedClick.x, event.clientY - suppressedClick.y) < 5
    ) {
      suppressedClick = undefined;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }

  function onScroll(): void {
    if (active?.started) updateTarget(active);
  }

  document.addEventListener('pointermove', onPointerMove, { capture: true, passive: false });
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('pointercancel', onPointerCancel, true);
  document.addEventListener('lostpointercapture', onPointerCancel, true);
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('scroll', onScroll, true);
  window.addEventListener('blur', cancel);

  return {
    attach(handle, row, profileId) {
      if (destroyed || attached.has(handle)) return;
      attached.add(handle);
      handle.draggable = false;
      handle.style.touchAction = 'none';
      handle.addEventListener('pointerdown', (event) => {
        if (
          destroyed ||
          active ||
          event.button !== 0 ||
          event.isPrimary === false ||
          !list.contains(row) ||
          !row.dataset.fieldId ||
          row.dataset.section === undefined
        )
          return;
        active = {
          handle,
          row,
          profileId,
          sourceId: row.dataset.fieldId,
          section: row.dataset.section,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          x: event.clientX,
          y: event.clientY,
          started: false,
          target: null,
          ghost: null,
          scrollContainers: scrollingAncestors(),
        };
        try {
          handle.setPointerCapture(event.pointerId);
        } catch {
          /* Document listeners still cover synthetic pointers. */
        }
      });
    },
    cancel,
    destroy() {
      destroyed = true;
      cancel();
      suppressedClick = undefined;
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerCancel, true);
      document.removeEventListener('lostpointercapture', onPointerCancel, true);
      document.removeEventListener('keydown', onKeyDown, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('blur', cancel);
    },
  };
}
