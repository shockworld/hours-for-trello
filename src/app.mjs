import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { groupReport, validDate, validateLog } from './db.mjs';

const ID = '[a-fA-F0-9]{24}';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function json(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(data));
}
async function readBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw new HttpError(415, 'Content-Type must be application/json');
  let content = '';
  for await (const chunk of req) {
    content += chunk.toString('utf8');
    if (Buffer.byteLength(content) > 8192) throw new HttpError(413, 'Request too large');
  }
  try { return JSON.parse(content); } catch { throw new HttpError(400, 'Invalid JSON'); }
}
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function createApp({ store, jwtVerifier, trello, writers = new Set(),
  publicDir = resolve('public'), origin = 'https://hours-for-trello.shockworld.net' }) {
  const secureHeaders = {
    'x-content-type-options': 'nosniff',
    'strict-transport-security': 'max-age=31536000; includeSubDomains',
    'referrer-policy': 'no-referrer',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': "default-src 'none'; script-src 'self' https://p.trellocdn.com; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors https://trello.com https://*.trello.com; base-uri 'none'; form-action 'self'",
  };
  async function handle(req, res) {
    for (const [key, value] of Object.entries(secureHeaders)) res.setHeader(key, value);
    // Do not set X-Frame-Options; Trello embedding is restricted by CSP frame-ancestors.
    const url = new URL(req.url || '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
      let path;
      try { path = decodeURIComponent(url.pathname); } catch { return json(res, 400, { error: 'Invalid path' }); }
      if (path.includes('\0') || path.includes('\\')) return json(res, 400, { error: 'Invalid path' });
      if (path === '/') path = '/index.html';
      const file = resolve(publicDir, '.' + path);
      if (!file.startsWith(resolve(publicDir) + sep)) return json(res, 404, { error: 'Not found' });
      const type = MIME[extname(file)];
      if (!type) return json(res, 404, { error: 'Not found' });
      try {
        const body = await readFile(file);
        res.writeHead(200, { 'content-type': type, 'cache-control': extname(file) === '.html' ? 'no-store' : 'public, max-age=600' });
        return res.end(req.method === 'HEAD' ? undefined : body);
      } catch { return json(res, 404, { error: 'Not found' }); }
    }
    if (req.headers.origin && req.headers.origin !== origin) throw new HttpError(403, 'Unexpected origin');
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) throw new HttpError(401, 'Authentication required');
    let user;
    try { user = await jwtVerifier(header.slice(7)); }
    catch { throw new HttpError(401, 'Invalid or expired Trello authentication'); }
    let member;
    try { member = await trello.isMember(user.boardId, user.memberId); }
    catch { throw new HttpError(503, 'Trello membership verification unavailable'); }
    if (!member) throw new HttpError(403, 'Not a board member');
    const canWrite = writers.has(user.memberId);
    if (url.pathname === '/api/me' && req.method === 'GET') return json(res, 200, { memberId: user.memberId, canWrite });

    const cardMatch = new RegExp(`^/api/cards/(${ID})/logs$`).exec(url.pathname);
    if (cardMatch && (req.method === 'GET' || req.method === 'POST')) {
      let card;
      try { card = await trello.card(user.boardId, cardMatch[1]); }
      catch { throw new HttpError(503, 'Trello card verification unavailable'); }
      if (!card) throw new HttpError(404, 'Card not found on this board');
      if (req.method === 'GET') {
        const logs = store.card(user.boardId, card.id);
        return json(res, 200, { card, logs, totalMinutes: logs.reduce((n, l) => n + l.minutes, 0) });
      }
      if (!canWrite) throw new HttpError(403, 'Only designated team members can register hours');
      const input = await readBody(req);
      let valid;
      try { valid = validateLog(input); } catch (error) { throw new HttpError(400, error.message); }
      let memberName;
      try { memberName = await trello.memberName(user.memberId); }
      catch { throw new HttpError(503, 'Trello member lookup unavailable'); }
      const entry = store.add({ ...valid, boardId: user.boardId, cardId: card.id,
        cardName: card.name, cardUrl: card.url, memberId: user.memberId, memberName });
      return json(res, 201, { entry, totalMinutes: store.card(user.boardId, card.id).reduce((n, l) => n + l.minutes, 0) });
    }
    const logMatch = /^\/api\/logs\/([\da-fA-F-]{36})$/.exec(url.pathname);
    if (logMatch && ['PUT', 'DELETE'].includes(req.method)) {
      if (!canWrite) throw new HttpError(403, 'Read-only account');
      const entry = store.get(logMatch[1]);
      if (!entry || entry.boardId !== user.boardId) throw new HttpError(404, 'Log not found');
      if (entry.memberId !== user.memberId) throw new HttpError(403, 'Cannot modify another member\'s log');
      if (req.method === 'PUT') {
        const input = await readBody(req);
        let valid;
        try { valid = validateLog(input); } catch (error) { throw new HttpError(400, error.message); }
        const updated = store.update(entry.id, valid);
        return json(res, 200, { entry: updated, totalMinutes: store.card(entry.boardId, entry.cardId).reduce((n, l) => n + l.minutes, 0) });
      }
      store.delete(entry.id);
      return json(res, 200, { deleted: true, totalMinutes: store.card(entry.boardId, entry.cardId).reduce((n, l) => n + l.minutes, 0) });
    }
    const reportMatch = new RegExp(`^/api/boards/(${ID})/report$`).exec(url.pathname);
    if (reportMatch && req.method === 'GET') {
      if (reportMatch[1] !== user.boardId) throw new HttpError(403, 'Different board');
      const from = url.searchParams.get('from'), to = url.searchParams.get('to');
      if (!validDate(from) || !validDate(to) || from > to ||
        (new Date(to).getTime() - new Date(from).getTime()) > 366 * 86400000) {
        throw new HttpError(400, 'Invalid date range (maximum 366 days)');
      }
      return json(res, 200, { from, to, ...groupReport(store.report(user.boardId, from, to)) });
    }
    return json(res, 404, { error: 'Not found' });
  }
  return createServer((req, res) => {
    Promise.resolve(handle(req, res)).catch(error => {
      if (error.status >= 400 && error.status < 500) return json(res, error.status, { error: error.message });
      console.error('Request error', error.message);
      return json(res, error.status === 503 ? 503 : 500, { error: error.status === 503 ? error.message : 'Internal server error' });
    });
  });
}
