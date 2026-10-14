import { resolve } from 'node:path';
import { createStore } from './db.mjs';
import { createJwtVerifier } from './auth.mjs';
import { createTrello } from './trello.mjs';
import { createApp } from './app.mjs';

const required = ['TRELLO_POWER_UP_ID', 'TRELLO_API_KEY', 'TRELLO_SERVICE_TOKEN', 'WRITER_MEMBER_IDS', 'PUBLIC_ORIGIN'];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required`);
const store = createStore(resolve(process.env.SQLITE_PATH || './data/hours.sqlite'));
const app = createApp({
  store,
  jwtVerifier: createJwtVerifier({ pluginId: process.env.TRELLO_POWER_UP_ID }),
  trello: createTrello({ apiKey: process.env.TRELLO_API_KEY, serviceToken: process.env.TRELLO_SERVICE_TOKEN }),
  writers: new Set(process.env.WRITER_MEMBER_IDS.split(',').map(id => id.trim()).filter(Boolean)),
  origin: process.env.PUBLIC_ORIGIN.replace(/\/$/, ''),
  publicDir: resolve('public'),
});
app.listen(Number(process.env.PORT || 3000), process.env.HOST || '127.0.0.1', () => {
  console.log(`Hours for Trello listening on port ${process.env.PORT || 3000}`);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => app.close(() => {
  store.close(); process.exit(0);
}));
