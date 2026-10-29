import { mountSubmissionCapture } from '../src/submission-capture';
const url = () => new URL(document.body.dataset.trackingUrl || location.href);
mountSubmissionCapture({ url });
const form = document.querySelector('form')!;
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const mode = (document.querySelector('#outcome') as HTMLSelectElement).value;
  const status = document.querySelector('#result')!;
  if (mode === 'error') {
    status.textContent = 'Unable to submit your application. Please correct the form.';
    return;
  }
  if (mode === 'navigate') {
    location.href = '/careers/apply/tracking-complete';
    return;
  }
  setTimeout(() => {
    form.remove();
    status.innerHTML =
      '<h2>Application sent</h2><p>Your application has been submitted successfully.</p>';
  }, 180);
});
