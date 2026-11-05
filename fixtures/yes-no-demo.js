// Synthetic page controls only; packaged autofill runs unchanged in this frame.
const questions = document.getElementById('questions');
const output = document.getElementById('committed');
let step = 0;
const radio = (name, label, chosen = '') =>
  `<div class="question-block"><p class="question">${label}</p><fieldset role="radiogroup"><div class="options">
    <div class="styled-choice"><div><input type="radio" id="${name}-yes" name="radio-group-${name}" aria-label="${label}" ${chosen === 'Yes' ? 'checked' : ''}><label for="${name}-yes"></label></div><div><p class="choice-text">Yes</p></div></div>
    <div class="styled-choice"><div><input type="radio" id="${name}-no" name="radio-group-${name}" aria-label="${label}" ${chosen === 'No' ? 'checked' : ''}><label for="${name}-no"></label></div><div><p class="choice-text">No</p></div></div></div></fieldset></div>`;
function report() {
  const selected = [...questions.querySelectorAll('input[type="radio"]:checked')].map(
    (input) =>
      input.closest('.styled-choice')?.querySelector('.choice-text')?.textContent || input.value,
  );
  const custom = questions.querySelector('[role=radio][aria-checked=true]')?.textContent || 'empty';
  const dropdown = questions.querySelector('select').value || 'empty';
  output.textContent = `Step ${step} · Yes: ${selected.filter((value) => value === 'Yes').length} · Existing No: ${selected.includes('No') ? 'kept' : 'missing'} · Custom choice: ${custom} · Dropdown: ${dropdown}`;
}
function render() {
  step++;
  questions.innerHTML =
    radio('python', 'Do you have strong experience in Python?') +
    radio('tools', 'Are you comfortable with Git and Docker?') +
    radio('existing', 'An answer you already chose', 'No') +
    `<div role="radiogroup" aria-label="Ready to complete onboarding?"><div class="question">Ready to complete onboarding?</div><button type="button" role="radio" aria-checked="false">Yes</button><button type="button" role="radio" aria-checked="false">No</button></div>
    <div class="field"><label for="select">Can you work with this team?<select id="select"><option value="">Select an option</option><option>Yes</option><option>No</option></select></label></div>
    <fieldset><legend>Three choices are left for you</legend><label><input type="radio" name="three" value="Yes">Yes</label><label><input type="radio" name="three" value="No">No</label><label><input type="radio" name="three" value="Maybe">Maybe</label></fieldset>`;
  for (const option of questions.querySelectorAll('[role=radio]'))
    option.addEventListener('click', () => {
      for (const other of option.parentElement.querySelectorAll('[role=radio]'))
        other.setAttribute('aria-checked', String(option === other));
      report();
    });
  for (const option of questions.querySelectorAll('.styled-choice'))
    option.addEventListener('click', (event) => {
      const input = option.querySelector('input');
      if (event.target !== input && !event.target.closest('label')) input.click();
    });
  report();
}
questions.addEventListener('change', report);
document.getElementById('next-step').addEventListener('click', render);
render();
