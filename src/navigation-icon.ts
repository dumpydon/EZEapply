/** Image-generated, locally packaged navigation artwork. Accessible names belong to the controls. */
export function navigationIcon(
  kind: 'applications' | 'profile' | 'settings' | 'analytics' | 'sidepane' | 'extensions',
): HTMLImageElement {
  const image = document.createElement('img');
  image.className = 'navigation-icon';
  image.src = chrome.runtime.getURL(`custom/navigation/${kind}.png`);
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.width = image.height = 34;
  image.draggable = false;
  return image;
}
