import { api, localDate, formatHours, element, setFeedback } from './common.js';

const t = window.TrelloPowerUp.iframe();
const cardId = t.getContext().card;
const list = document.querySelector('#logs');
const form = document.querySelector('#log-form');
const submit = form.querySelector('button[type="submit"]');
const date = document.querySelector('#date');
const hours = document.querySelector('#hours');
const minutes = document.querySelector('#minutes');
const description = document.querySelector('#description');
let currentUser = null;
let editingId = null;

function line(entry) {
  const item = element('li', 'log-item');
  const top = element('div', 'log-top');
  top.append(element('strong', null, formatHours(entry.minutes)));
  top.append(element('span', 'muted', `${entry.workDate} · ${entry.memberName}`));
  item.append(top, element('div', 'description', entry.description));
  if (currentUser?.canWrite && entry.memberId === currentUser.memberId) {
    const buttons = element('div', 'actions');
    const edit = element('button', 'link-button', 'Edit');
    edit.type = 'button';
    edit.addEventListener('click', () => {
      editingId = entry.id;
      date.value = entry.workDate;
      hours.value = String(Math.floor(entry.minutes / 60));
      minutes.value = String(entry.minutes % 60);
      description.value = entry.description;
      submit.textContent = 'Save changes';
      document.querySelector('#cancel').hidden = false;
      description.focus();
    });
    const remove = element('button', 'link-button danger-text', 'Delete');
    remove.type = 'button';
    remove.addEventListener('click', async () => {
      if (!confirm('Delete this time entry?')) return;
      try {
        const result = await api(t, `/api/logs/${encodeURIComponent(entry.id)}`, { method: 'DELETE' });
        await syncBadge(result.totalMinutes);
        setFeedback('Entry deleted.');
        await refresh();
      } catch (error) { setFeedback(error.message, true); }
    });
    buttons.append(edit, remove);
    item.append(buttons);
  }
  return item;
}
async function syncBadge(totalMinutes) {
  // The server is the authoritative source; plugin data is only a fast badge cache.
  await t.set('card', 'shared', 'totalMinutes', totalMinutes);
}
async function refresh() {
  const result = await api(t, `/api/cards/${encodeURIComponent(cardId)}/logs`);
  document.querySelector('#total').textContent = formatHours(result.totalMinutes);
  list.replaceChildren(...result.logs.map(line));
  document.querySelector('#empty').hidden = result.logs.length > 0;
}
function reset() {
  editingId = null;
  form.reset();
  date.value = localDate();
  hours.value = '1';
  minutes.value = '0';
  submit.textContent = 'Add work hours';
  document.querySelector('#cancel').hidden = true;
}
document.querySelector('#cancel').addEventListener('click', reset);
form.addEventListener('submit', async event => {
  event.preventDefault();
  const number = Number(hours.value) * 60 + Number(minutes.value);
  if (!Number.isInteger(number) || number < 1 || number > 1440) {
    return setFeedback('Enter a duration between 1 minute and 24 hours.', true);
  }
  const payload = { workDate: date.value, minutes: number, description: description.value };
  submit.disabled = true;
  try {
    const target = editingId ? `/api/logs/${editingId}` : `/api/cards/${encodeURIComponent(cardId)}/logs`;
    const result = await api(t, target, { method: editingId ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    await syncBadge(result.totalMinutes);
    reset();
    setFeedback('Saved.');
    await refresh();
  } catch (error) { setFeedback(error.message, true); }
  finally { submit.disabled = false; }
});
(async () => {
  date.value = localDate();
  try {
    currentUser = await api(t, '/api/me');
    form.hidden = !currentUser.canWrite || t.getContext().permissions?.card !== 'write';
    await refresh();
  } catch (error) {
    form.hidden = true;
    setFeedback(`Could not load work hours: ${error.message}`, true);
  }
})();
