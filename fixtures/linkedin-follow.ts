// Runs the production watcher and storage listener. The preview bundler changes
// only the hostname check for localhost; the extension keeps its LinkedIn gate.
// No LinkedIn account, employer, submission or real profile data is used.
import { mountLinkedInFollow } from '../src/linkedin-follow';
import { LINKEDIN_NOFOLLOW_KEY } from '../src/types';
const prefsKey = 'eze-native-preview-preferences';
const review = document.getElementById('review')!,
  output = document.getElementById('result')!;
let number = 0;
function render(open = true) {
  number++;
  review.innerHTML = `<dialog class="review-dialog" ${open ? 'open' : ''} aria-labelledby="application-title"><h2 id="application-title">Apply to Example Company ${number}</h2><h3>Review your application</h3><div><input id="follow" type="checkbox" checked><label for="follow">Follow Example Company ${number} to stay up to date with their page</label></div><label><input id="answer" type="checkbox" checked>I completed the following training</label><button type="button" disabled>Submit application (disabled in preview)</button></dialog>`;
  update();
}
function update() {
  const preferences = JSON.parse(localStorage.getItem(prefsKey) || '{}');
  const checked = (document.getElementById('follow') as HTMLInputElement)?.checked;
  const text = `Preference ${preferences[LINKEDIN_NOFOLLOW_KEY] === true ? 'ON' : 'OFF'} · review ${review.querySelector('dialog')?.open ? 'open' : 'closed'} · company-follow checkbox ${checked ? 'checked' : 'unchecked'} · unrelated answer ${(document.getElementById('answer') as HTMLInputElement)?.checked ? 'kept' : 'cleared'}`;
  if (output.textContent !== text) output.textContent = text;
}
window.addEventListener('storage', (event) => {
  if (event.key === prefsKey) update();
});
document.addEventListener('change', update);
document.getElementById('next')!.addEventListener('click', () => render());
document.getElementById('prepare')!.addEventListener('click', () => render(false));
document.getElementById('open')!.addEventListener('click', () => {
  review.querySelector('dialog')!.show();
  update();
});
document.getElementById('recheck')!.addEventListener('click', () => {
  (document.getElementById('follow') as HTMLInputElement).checked = true;
  update();
});
render();
const dispose = mountLinkedInFollow();
window.addEventListener('pagehide', dispose, { once: true });
