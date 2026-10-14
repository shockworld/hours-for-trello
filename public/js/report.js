import { api, localDate, formatHours, element, setFeedback } from './common.js';
const t = window.TrelloPowerUp.iframe();
const boardId = t.getContext().board;
const fromInput = document.querySelector('#from');
const toInput = document.querySelector('#to');
const tbody = document.querySelector('#rows');
const today = new Date();
fromInput.value = localDate(new Date(today.getFullYear(), today.getMonth(), 1));
toInput.value = localDate(new Date(today.getFullYear(), today.getMonth() + 1, 0));

function cardRow(card) {
  const row = element('tr');
  const name = element('td');
  const link = element('a', null, card.cardName);
  // Only allow Trello URLs in saved report data.
  if (/^https:\/\/trello\.com\/c\/[a-zA-Z0-9]+/.test(card.cardUrl)) {
    link.href = card.cardUrl; link.target = '_blank'; link.rel = 'noopener noreferrer';
  }
  name.append(link);
  const duration = element('td', 'numeric', formatHours(card.totalMinutes));
  row.append(name, duration);
  const detailsRow = element('tr');
  detailsRow.className = 'detail-row';
  detailsRow.hidden = true;
  const detail = element('td');
  detail.colSpan = 2;
  const list = element('ul', 'report-entries');
  for (const log of card.entries) {
    const li = element('li');
    li.append(element('strong', null, formatHours(log.minutes)),
      element('span', 'muted', ` ${log.workDate} · ${log.memberName} · `),
      document.createTextNode(log.description));
    list.append(li);
  }
  detail.append(list); detailsRow.append(detail);
  const expand = element('button', 'link-button', `${card.entries.length} entries ▾`);
  expand.type = 'button';
  expand.addEventListener('click', () => {
    detailsRow.hidden = !detailsRow.hidden;
    expand.textContent = `${card.entries.length} entries ${detailsRow.hidden ? '▾' : '▴'}`;
  });
  name.append(document.createTextNode(' '), expand);
  return [row, detailsRow];
}
async function load(event) {
  event?.preventDefault();
  tbody.replaceChildren();
  setFeedback('Loading report…');
  try {
    const result = await api(t, `/api/boards/${encodeURIComponent(boardId)}/report?from=${encodeURIComponent(fromInput.value)}&to=${encodeURIComponent(toInput.value)}`);
    document.querySelector('#total').textContent = formatHours(result.totalMinutes);
    document.querySelector('#card-count').textContent = `${result.cards.length} cards`;
    tbody.replaceChildren(...result.cards.flatMap(cardRow));
    setFeedback(result.cards.length ? '' : 'No work hours registered in this date range.');
  } catch (error) { setFeedback(error.message, true); }
}
document.querySelector('#filters').addEventListener('submit', load);
load();
