# Hours for Trello

A lightweight Trello Power-Up for logging work hours on cards and showing transparent monthly reports to clients. Based on the integration pattern used in [Away for Trello](https://github.com/shockworld/away-for-trello).

## Features

- Record a work **date**, **duration** (hours and minutes), and **short description** on any Trello card.
- Display the per-card work log with author, description, date, total time, and options to edit/delete your own entries.
- Display the card's **total hours as a badge on its front** (Trello plugin data is used **only as a badge cache**).
- Open the **Hours report** from the board header. Filter by inclusive date range and view a per-card summary with expandable individual entries, including logs on archived cards.
- Guests, regular members and board administrators all see **the same board's records and reports**. The server uses Trello JWTs and verifies board membership against the Trello API. Clients never gain access to other boards' data.
- Only configured staff member IDs can register time; they can edit/delete only their own logs. Trello's board administrator role is deliberately not used as a billing-time permission.
- No extra login, no frontend framework, no npm dependencies, no third-party analytics.

## Architecture

```text
Trello board and cards
  └─ Hours for Trello Power-Up (static JS/HTML UI, iframe)
      ├─ Trello-signed t.jwt() for each API request
      ├─ /api/* on the same origin, Node.js >=22.13
      │    ├─ validate JWT via Trello public signing keys
      │    ├─ verify current board membership and card->board ownership via Trello API
      │    └─ SQLite (one database, records partitioned by board ID)
      └─ t.set('card','shared','totalMinutes',n) after writes (fast visible badge)
```

**Why a backend?** Trello shared plugin storage is limited and a card's entries would eventually exceed it. SQLite also makes date-range reporting, archived-card history and author permissions straightforward. Unlike Away for Trello, this app is not just static hosting.

## Requirements

- Node.js **22.13+** (tested on 22.16; uses built-in `node:sqlite`, which shows an experimental API warning in Node 22). Prefer a newer supported Node release after verifying compatibility.
- A public HTTPS domain that can serve the frontend and reverse-proxy `/api/*` **to the same Node server**.
- A Trello Power-Up created at [Trello Power-Ups Admin](https://trello.com/power-ups/admin).
- A Trello API key plus a **read-only service token** belonging to a trusted Trello account that is a member of **every client board to be supported**. That account must have permission to list board members and fetch cards and user names. If a board is inaccessible to the service account, all its API access is rejected.
- The Trello IDs of staff allowed to log hours; **guest clients are not added to this list**.

## Setup

1. Create the Power-Up in Trello. Set the **Iframe connector URL** to `https://hours-for-trello.shockworld.net/`. Enable **`board-buttons`**, **`card-back-section`** and **`card-badges`**.
2. Under the Power-Up's Trello authentication configuration, generate an API key. Generate a **read-only** Trello token for a trusted service account that is a member of every board that will use the Power-Up.
3. Get the Power-Up ID from Trello's administration page, and find staff member IDs using Trello's REST API (`/1/members/me?key=...&token=...` with that staff member's own token) or their profile data. IDs must be 24-character hexadecimal Trello identifiers.
4. Copy `.env.example` to `.env`, fill the values and keep it **outside version control**. This project does not use a `.env` loader; export those variables in the process environment using your process manager, Plesk or systemd.
5. Run `npm test` and `npm run check`. Set an absolute `SQLITE_PATH` pointing to a persistent writable directory and run `npm start`.
6. In Nginx/Plesk configure HTTPS and reverse-proxy **the entire domain** to `127.0.0.1:3000` (not just `/api/`), including the Power-Up iframe connector pages. Ensure TLS and the `Content-Security-Policy` frame-ancestors header are preserved. Do not add `X-Frame-Options: DENY/SAMEORIGIN` in Nginx.
7. Enable the Power-Up on a test board. With a configured staff user, create a work log, verify the card badge, then test from a separate guest account that the entry and Board Report are visible but not editable. Test archived cards and month boundaries.

Sample environment variables are in `.env.example`. `WRITER_MEMBER_IDS` is a comma-separated allowlist. On startup, an empty or absent writer allowlist is rejected so that client work logs cannot be modified accidentally. **Do not put API tokens, JWTs or the SQLite database in a public GitHub repository.**

## Storage, backups and recovery

- Tables are initialized automatically on first startup; no manual migration is required for version 0.1.
- Back up the SQLite database using SQLite's online backup API or stop the app and copy the database along with any `-wal`/`-shm` files. For a reliable snapshot, prefer the SQLite `.backup` command. Do not back up only a live `.sqlite` file while writes are active.
- A board's entries stay in SQLite even if a Trello card is archived (its name and URL are snapshotted when time is registered). Existing work entries are **not** automatically removed when an administrator disables the Power-Up. Implement an operator-controlled data export/deletion workflow before broad public distribution.
- `t.set()` updates the visible badge total when a team member saves, edits or deletes a work log from the card. If data is modified directly in SQLite, these cached badges must be resynchronized from the card UI or via an added maintenance tool.

## Security and operating considerations

- Trello JWTs (`t.jwt()`) are RSA-SHA256 verified against rotating public keys at `https://api.trello.com/1/resource/jwt-public-keys`. The server checks issuer, expiry, Power-Up ID, Trello board ID and member ID; IDs sent by the client are **never trusted**.
- On **every API request**, the server checks that the JWT member currently belongs to the board. For card requests it also queries Trello to ensure that card belongs to the same board. Authorization is not determined by client-side UI state.
- The service token is only used on the server and requires no write permission. Client access is scoped to their board; creating logs is restricted to `WRITER_MEMBER_IDS`, modifying a log is additionally restricted to its author.
- Work descriptions are displayed as text, not HTML, to prevent XSS. API requests and server errors use `Cache-Control: no-store`; the app ships restrictive CSP and iframe allowance for Trello.
- Apply reverse proxy request-rate limits and set alerts for Trello API failures. The app needs outbound HTTPS access to `api.trello.com`.
- When making the Power-Up public, replace the draft privacy/support texts with your operator's real contact, hosting location, retention period, and GDPR details.

## Development

```sh
npm test
npm run check
npm start
```

The server refuses to start until required Trello credentials are provided. Tests run with an in-memory SQLite database and mock Trello identity/card access, so no live Trello credentials are needed.

`public/` is the browser UI, `src/` the API/auth/data service, and `test/` the automated tests. Production data lives **outside** the repository.

## License

MIT. See [LICENSE](LICENSE).
