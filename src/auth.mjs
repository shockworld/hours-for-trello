import { createVerify } from 'node:crypto';

const KEY_URL = 'https://api.trello.com/1/resource/jwt-public-keys';
const b64json = value => JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
const trelloId = value => typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);

export function createJwtVerifier({ pluginId, fetchImpl = fetch, clock = () => Date.now(), keySource } = {}) {
  if (!trelloId(pluginId)) throw new Error('TRELLO_POWER_UP_ID must be a Trello ID');
  let keys = null;
  let expires = 0;
  let lastForcedRefresh = 0;
  async function publicKeys(force = false) {
    if (keySource) return keySource();
    if (!force && keys && clock() < expires) return keys;
    // Prevent invalid signatures from forcing an external key fetch per request.
    if (force && keys && clock() - lastForcedRefresh < 60_000) return keys;
    if (force) lastForcedRefresh = clock();
    const response = await fetchImpl(KEY_URL, { signal: AbortSignal.timeout(6000) });
    if (!response.ok) throw new Error('Trello signing keys unavailable');
    const body = await response.json();
    if (!Array.isArray(body.keys) || !body.keys.length) throw new Error('No Trello signing keys');
    keys = body.keys;
    expires = clock() + 4 * 60 * 60 * 1000;
    return keys;
  }
  return async token => {
    if (typeof token !== 'string' || token.length > 12000) throw new Error('Missing or invalid token');
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Malformed token');
    let header, claims;
    try { header = b64json(parts[0]); claims = b64json(parts[1]); }
    catch { throw new Error('Malformed token'); }
    if (header.alg !== 'RS256' || header.typ !== 'JWT') throw new Error('Invalid JWT algorithm');
    const signature = Buffer.from(parts[2], 'base64url');
    const verifyWith = list => list.some(key => {
      try { return createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).end().verify(key, signature); }
      catch { return false; }
    });
    if (!verifyWith(await publicKeys()) && !verifyWith(await publicKeys(true))) {
      throw new Error('Invalid JWT signature');
    }
    const now = Math.floor(clock() / 1000);
    if (claims.iss !== 'trello' || claims.idPlugin !== pluginId ||
      !trelloId(claims.idBoard) || !trelloId(claims.idMember) ||
      !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) ||
      claims.iat > now + 30 || claims.exp <= now - 30 ||
      claims.exp <= claims.iat || claims.exp - claims.iat > 3600) {
      throw new Error('Invalid JWT claims');
    }
    return { boardId: claims.idBoard, memberId: claims.idMember };
  };
}
