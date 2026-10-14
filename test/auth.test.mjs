import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { createJwtVerifier } from '../src/auth.mjs';
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const key = publicKey.export({ type: 'spki', format: 'pem' });
const plugin = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const now = 1781366400;
function token(overrides = {}, alg = 'RS256') {
  const hdr = Buffer.from(JSON.stringify({ alg, typ: 'JWT' })).toString('base64url');
  const claims = Buffer.from(JSON.stringify({ iss: 'trello', idPlugin: plugin,
    idBoard: 'bbbbbbbbbbbbbbbbbbbbbbbb', idMember: 'cccccccccccccccccccccccc',
    iat: now, exp: now + 900, ...overrides })).toString('base64url');
  const body = `${hdr}.${claims}`;
  const sig = createSign('RSA-SHA256').update(body).end().sign(privateKey).toString('base64url');
  return `${body}.${sig}`;
}
test('verifies signed Trello JWTs, identity and exact plugin', async () => {
  const verify = createJwtVerifier({ pluginId: plugin, keySource: async () => [key], clock: () => now * 1000 });
  assert.deepEqual(await verify(token()), { boardId: 'bbbbbbbbbbbbbbbbbbbbbbbb', memberId: 'cccccccccccccccccccccccc' });
  await assert.rejects(verify(token({ idPlugin: 'dddddddddddddddddddddddd' })));
  await assert.rejects(verify(token({ iss: 'someone-else' })));
  await assert.rejects(verify(token({ exp: now - 60 })));
  await assert.rejects(verify(token({ iat: now + 60 })));
  await assert.rejects(verify(token({}, 'HS256')));
  await assert.rejects(verify(token().slice(0, -2) + 'xx'));
});
