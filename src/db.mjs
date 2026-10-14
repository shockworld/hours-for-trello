import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validateLog(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid work log');
  const { workDate, minutes, description } = input;
  if (!validDate(workDate)) throw new Error('Invalid work date');
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) throw new Error('Minutes must be between 1 and 1440');
  if (typeof description !== 'string' || !description.trim() || description.trim().length > 500) {
    throw new Error('Description must contain 1–500 characters');
  }
  return { workDate, minutes, description: description.trim() };
}

export function createStore(file = ':memory:') {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS work_logs (
      id TEXT PRIMARY KEY,
      board_id TEXT NOT NULL,
      card_id TEXT NOT NULL,
      card_name TEXT NOT NULL,
      card_url TEXT NOT NULL,
      member_id TEXT NOT NULL,
      member_name TEXT NOT NULL,
      work_date TEXT NOT NULL,
      minutes INTEGER NOT NULL CHECK(minutes BETWEEN 1 AND 1440),
      description TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ix_logs_board_date ON work_logs (board_id, work_date);
    CREATE INDEX IF NOT EXISTS ix_logs_board_card ON work_logs (board_id, card_id);
  `);
  const selectFields = `id, board_id AS boardId, card_id AS cardId,
    card_name AS cardName, card_url AS cardUrl, member_id AS memberId,
    member_name AS memberName, work_date AS workDate, minutes, description,
    created_at AS createdAt, updated_at AS updatedAt`;
  const find = db.prepare(`SELECT ${selectFields} FROM work_logs WHERE id=?`);
  const byCard = db.prepare(`SELECT ${selectFields} FROM work_logs WHERE board_id=? AND card_id=? ORDER BY work_date DESC, created_at DESC, id DESC`);
  const byBoard = db.prepare(`SELECT ${selectFields} FROM work_logs WHERE board_id=? AND work_date>=? AND work_date<=? ORDER BY card_name COLLATE NOCASE, work_date, created_at`);
  const refreshCardName = db.prepare('UPDATE work_logs SET card_name=?, card_url=? WHERE board_id=? AND card_id=?');
  const add = db.prepare(`INSERT INTO work_logs
    (id, board_id, card_id, card_name, card_url, member_id, member_name, work_date, minutes, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const edit = db.prepare(`UPDATE work_logs SET work_date=?, minutes=?, description=?, updated_at=? WHERE id=?`);
  const remove = db.prepare('DELETE FROM work_logs WHERE id=?');
  return {
    get: id => find.get(id),
    card: (boardId, cardId) => byCard.all(boardId, cardId),
    report: (boardId, from, to) => byBoard.all(boardId, from, to),
    add({ boardId, cardId, cardName, cardUrl, memberId, memberName, ...input }) {
      const log = validateLog(input);
      const id = randomUUID();
      const now = new Date().toISOString();
      // Keep reports current when a card has been renamed since previous entries.
      refreshCardName.run(cardName, cardUrl, boardId, cardId);
      add.run(id, boardId, cardId, cardName, cardUrl, memberId, memberName, log.workDate, log.minutes, log.description, now, now);
      return find.get(id);
    },
    update(id, input) {
      const log = validateLog(input);
      edit.run(log.workDate, log.minutes, log.description, new Date().toISOString(), id);
      return find.get(id);
    },
    delete(id) { return remove.run(id).changes === 1; },
    close() { db.close(); },
  };
}

export function groupReport(logs) {
  const cards = new Map();
  for (const log of logs) {
    if (!cards.has(log.cardId)) {
      cards.set(log.cardId, { cardId: log.cardId, cardName: log.cardName, cardUrl: log.cardUrl,
        totalMinutes: 0, entries: [] });
    }
    const card = cards.get(log.cardId);
    card.totalMinutes += log.minutes;
    card.entries.push(log);
  }
  return { totalMinutes: logs.reduce((sum, log) => sum + log.minutes, 0),
    cards: [...cards.values()].sort((a,b) => a.cardName.localeCompare(b.cardName)) };
}
