export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function formatHours(minutes) {
  return `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${String(minutes % 60).padStart(2, '0')} min` : ''}`;
}
export function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = String(text);
  return el;
}
export function setFeedback(message, isError = false) {
  const target = document.querySelector('#feedback');
  target.textContent = message;
  target.className = isError ? 'feedback error' : 'feedback';
}
export async function api(t, path, init = {}) {
  const token = await t.jwt();
  const response = await fetch(path, {
    ...init,
    headers: { 'Authorization': `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    cache: 'no-store',
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}
