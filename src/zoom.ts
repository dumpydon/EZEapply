const KEY = 'eze.panelZoom.v1';
const LEVELS = [0.65, 0.75, 0.85, 0.9, 1, 1.1, 1.25, 1.5];

/** Page-local zoom: applied only to extension UI, never to an application tab. */
export function mountZoom(
  host: HTMLElement,
  onChange: (percent: number) => void,
): { step(direction: -1 | 1): void; reset(): void; dispose(): void } {
  let current = 1;
  try {
    const saved = Number(localStorage.getItem(KEY));
    if (LEVELS.includes(saved)) current = saved;
  } catch {
    /* Storage can be unavailable in a preview frame. */
  }
  const page = host.ownerDocument.body;
  const previous = page.style.zoom;
  function apply(value: number): void {
    current = value;
    page.style.zoom = String(value);
    onChange(Math.round(value * 100));
    try {
      localStorage.setItem(KEY, String(value));
    } catch {
      /* Zoom still works for this session. */
    }
  }
  const step = (direction: -1 | 1): void =>
    apply(LEVELS[Math.max(0, Math.min(LEVELS.length - 1, LEVELS.indexOf(current) + direction))]);
  const reset = (): void => apply(1);
  const keydown = (event: KeyboardEvent): void => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
    if (['-', '_', '+', '='].includes(event.key)) {
      event.preventDefault();
      event.stopPropagation();
      step(event.key === '-' || event.key === '_' ? -1 : 1);
    } else if (event.key === '0') {
      event.preventDefault();
      event.stopPropagation();
      reset();
    }
  };
  host.ownerDocument.addEventListener('keydown', keydown, true);
  apply(current);
  return {
    step,
    reset,
    dispose() {
      host.ownerDocument.removeEventListener('keydown', keydown, true);
      page.style.zoom = previous;
    },
  };
}
