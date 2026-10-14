import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/db.mjs';
import { createApp } from '../src/app.mjs';
const A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const C = 'cccccccccccccccccccccccc';
const D = 'dddddddddddddddddddddddd';
const E = 'eeeeeeeeeeeeeeeeeeeeeeee';
const card1 = '111111111111111111111111';
const card2 = '222222222222222222222222';
const tokens = { writer: { boardId: A, memberId: C }, guest: { boardId: A, memberId: D },
  otherBoard: { boardId: B, memberId: E }, otherWriter: { boardId: A, memberId: E } };
async function harness() {
  const store = createStore();
  const app = createApp({
    store,
    jwtVerifier: async token => { if (!tokens[token]) throw new Error('invalid'); return tokens[token]; },
    writers: new Set([C, E]),
    trello: {
      isMember: async (board, member) => board === A ? [C, D, E].includes(member) : member === E,
      card: async (board, id) => board === A && [card1, card2].includes(id) ?
        { id, name: `Card ${id}`, url: `https://trello.com/c/${id}` } : null,
      memberName: async id => `Person ${id}`,
    },
    origin: 'https://hours-for-trello.example',
  });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${app.address().port}`;
  return { store, async call(who, path, method = 'GET', body) {
    const response = await fetch(url + path, {
      method, headers: { 'Authorization': `Bearer ${who}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  }, close: async () => { await new Promise(resolve => app.close(resolve)); store.close(); } };
}
test('staff logs hours, guests see all entries and month summary, isolated by board', async () => {
  const h = await harness();
  try {
    const fields = { workDate: '2026-10-13', minutes: 960, description: 'Implementation' };
    const a = await h.call('writer', `/api/cards/${card1}/logs`, 'POST', fields);
    assert.equal(a.status, 201); assert.equal(a.data.totalMinutes, 960);
    await h.call('writer', `/api/cards/${card2}/logs`, 'POST', { ...fields, minutes: 240 });
    assert.equal((await h.call('guest', `/api/cards/${card1}/logs`)).data.totalMinutes, 960);
    assert.equal((await h.call('guest', `/api/me`)).data.canWrite, false);
    const report = await h.call('guest', `/api/boards/${A}/report?from=2026-10-01&to=2026-10-31`);
    assert.equal(report.status, 200);
    assert.equal(report.data.totalMinutes, 1200);
    assert.equal(report.data.cards.length, 2);
    assert.equal((await h.call('guest', `/api/boards/${B}/report?from=2026-10-01&to=2026-10-31`)).status, 403);
    assert.equal((await h.call('otherBoard', `/api/cards/${card1}/logs`)).status, 404);
    assert.equal((await h.call('guest', `/api/cards/${card1}/logs`, 'POST', fields)).status, 403);
    assert.equal((await h.call('guest', `/api/logs/${a.data.entry.id}`, 'DELETE')).status, 403);
    assert.equal((await h.call('otherWriter', `/api/logs/${a.data.entry.id}`, 'PUT', fields)).status, 403);
    assert.equal((await h.call('writer', `/api/logs/${a.data.entry.id}`, 'PUT', { ...fields, minutes: 120 })).data.totalMinutes, 120);
    assert.equal((await h.call('writer', `/api/logs/${a.data.entry.id}`, 'DELETE')).data.totalMinutes, 0);
    assert.equal((await h.call('guest', `/api/boards/${A}/report?from=2026-10-01&to=2026-10-31`)).data.totalMinutes, 240);
  } finally { await h.close(); }
});
test('rejects malformed request, invalid date ranges, invalid auth and data', async () => {
  const h = await harness();
  try {
    assert.equal((await h.call('invalid', '/api/me')).status, 401);
    assert.equal((await h.call('guest', `/api/boards/${A}/report?from=2026-02-30&to=2026-10-13`)).status, 400);
    assert.equal((await h.call('writer', `/api/cards/${card1}/logs`, 'POST', { workDate:'2026-10-13',minutes:0,description:'x' })).status, 400);
    assert.equal((await h.call('writer', `/api/cards/${card1}/logs`, 'POST', { workDate:'2026-10-13',minutes:60,description:'<img src=x>' })).status, 201);
  } finally { await h.close(); }
});

test('serves browser assets with Trello iframe CSP', async () => {
  const store = createStore();
  const app = createApp({ store, jwtVerifier: async () => { throw new Error('invalid'); },
    trello: {}, writers: new Set() });
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${app.address().port}/`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Hours for Trello/);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors https:\/\/trello.com/);
    assert.equal(response.headers.get('x-frame-options'), null);
    const script = await fetch(`http://127.0.0.1:${app.address().port}/js/power-up.js`);
    assert.equal(script.status, 200);
    assert.match(await script.text(), /card-back-section/);
  } finally { await new Promise(resolve => app.close(resolve)); store.close(); }
});
