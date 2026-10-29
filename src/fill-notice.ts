/** Isolated, short-lived feedback. No page layout or employer styles are changed. */
export function fillNotice(document: Document): {
  show(text: string, busy?: boolean): void;
  dispose(): void;
} {
  let host: HTMLElement | undefined, timer: ReturnType<typeof setTimeout> | undefined;
  function dispose() {
    clearTimeout(timer);
    host?.remove();
    host = undefined;
  }
  return {
    show(text, busy = false) {
      dispose();
      if (document.defaultView?.top !== document.defaultView) return;
      host = document.createElement('ezeapply-status');
      const shadow = host.attachShadow({ mode: 'closed' }),
        style = document.createElement('style'),
        notice = document.createElement('div'),
        mark = document.createElement('span');
      style.textContent =
        ':host{all:initial;position:fixed;top:22px;left:50%;transform:translateX(-50%);z-index:2147483646;pointer-events:none}.notice{display:flex;align-items:center;gap:10px;max-width:calc(100vw - 32px);padding:12px 18px;border:1px solid #85e0bd88;border-radius:14px;background:linear-gradient(115deg,#167f70,#269b83 70%,#359d72);color:#fff;font:600 14px/1.4 -apple-system,BlinkMacSystemFont,sans-serif;box-shadow:0 8px 30px #092d2b44}.mark{width:14px;height:14px;flex:none;border-radius:50%;border:2px solid #ffffff55;border-top-color:white}.busy{animation:spin .8s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.busy{animation:none}}';
      notice.className = 'notice';
      notice.setAttribute('role', 'status');
      mark.className = `mark${busy ? ' busy' : ''}`;
      mark.setAttribute('aria-hidden', 'true');
      notice.append(mark, document.createTextNode(text));
      shadow.append(style, notice);
      document.documentElement.append(host);
      timer = setTimeout(dispose, busy ? 30000 : 2600);
    },
    dispose,
  };
}
