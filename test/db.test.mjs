import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore, groupReport, validDate, validateLog } from '../src/db.mjs';

const BOARD_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const BOARD_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
function add(store, boardId, cardId, minutes, workDate = '2026-10-13') {
  return store.add({ boardId, cardId, cardName: `Card ${cardId}`,
    cardUrl: `https://trello.com/c/${cardId}`, memberId: 'cccccccccccccccccccccccc',
    memberName: 'Team member', workDate, minutes, description: 'Completed task' });
}
test('validates Gregorian dates, durations and descriptions', () => {
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(validDate('2024-02-29'), true);
  assert.equal(validDate('2026-10-13'), true);
  assert.throws(() => validateLog({ workDate: '2026-10-13', minutes: 0, description: 'x' }));
  assert.throws(() => validateLog({ workDate: '2026-10-13', minutes: 30, description: '  ' }));
  assert.equal(validateLog({ workDate: '2026-10-13', minutes: 30, description: '  Work  ' }).description, 'Work');
});
test('board and card isolation, accurate month totals, archived card retention and edits', () => {
  const store = createStore();
  try {
    const a1 = add(store, BOARD_A, '111111111111111111111111', 60, '2026-10-01');
    add(store, BOARD_A, '111111111111111111111111', 30, '2026-10-31');
    add(store, BOARD_A, '222222222222222222222222', 240);
    add(store, BOARD_A, '222222222222222222222222', 120, '2026-09-30');
    add(store, BOARD_B, '333333333333333333333333', 999);
    assert.equal(store.card(BOARD_A, '111111111111111111111111').length, 2);
    assert.equal(store.card(BOARD_B, '111111111111111111111111').length, 0);
    let report = groupReport(store.report(BOARD_A, '2026-10-01', '2026-10-31'));
    assert.equal(report.totalMinutes, 330);
    assert.equal(report.cards.length, 2);
    assert.deepEqual(report.cards.map(x => x.totalMinutes).sort((a,b)=>a-b), [90, 240]);
    assert.equal(groupReport(store.report(BOARD_B, '2026-10-01', '2026-10-31')).totalMinutes, 999);
    store.update(a1.id, { workDate: '2026-11-01', minutes: 90, description: 'moved' });
    assert.equal(groupReport(store.report(BOARD_A, '2026-10-01', '2026-10-31')).totalMinutes, 270);
    assert.equal(store.get(a1.id).description, 'moved');
    assert.equal(store.delete(a1.id), true);
    assert.equal(store.get(a1.id), undefined);
  } finally { store.close(); }
});
