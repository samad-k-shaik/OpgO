# Multi-Hospital Virtual Queue SaaS (Phase 1 MVP Starter)

This repo scaffolds a Phase 1 MVP for a multi-tenant virtual queue system:
- Multi-hospital isolation via `hospitalId` and `x-hospital-access-token`
- Reception PWA (token create + start/complete/skip/cancel)
- Patient live tracking (position + premium reminders)
- TV display (current serving + next tokens)
- WhatsApp booking (MVP uses an HTTP simulation endpoint; webhook integration can be added later)

## Prerequisites
- Node.js + npm
- PostgreSQL running locally (or accessible) with database credentials matching the `.env` files

## Configure database
1. Update `/Users/abdussamad/cursor_q/.env` and `apps/api/.env` if needed.
2. Ensure PostgreSQL is reachable at:
   - `localhost:5432`
   - user: `cursor_q`
   - password: `cursor_q`
   - db: `cursor_q`

## Create DB schema + demo data
Run from the repo root:
```bash
npm run db:migrate --workspace api
npm run db:seed --workspace api
```

The seed prints the demo hospital access token to the console. By default it is:
- `DEMO_HOSPITAL_ACCESS_TOKEN`

## Start the services
In one terminal:
```bash
npm run dev --workspace api
```

In another terminal:
```bash
npm run dev --workspace web
```

Frontend:
- `http://localhost:5173`

Backend:
- `http://localhost:4001`

## How to use (MVP)
1. Open **Reception** and set the hospital access token in the top bar.
2. Create walk-in tokens (enter phone + choose doctor).
3. Use **TV Display** on a separate screen to watch live updates.
4. For remote booking testing, call:
   - `POST http://localhost:4001/v1/whatsapp/simulate-message`
   - with header `x-hospital-access-token: <DEMO_ACCESS_TOKEN>`
   - and JSON body like:
     ```json
     { "phone": "9999999999", "messageText": "TOKEN", "wantsPremium": true }
     ```

## API quick references
- `GET  /v1/hospital/doctors`
- `GET  /v1/display/queue`
- `GET  /v1/patient/queue/:tokenId`
- `POST /v1/tokens/walkin`
- `POST /v1/tokens/:tokenId/start`
- `POST /v1/tokens/:tokenId/complete`
- `POST /v1/tokens/:tokenId/skip`
- `POST /v1/tokens/:tokenId/cancel`
- `POST /v1/tokens/:tokenId/arrived`
- `POST /v1/tokens/:tokenId/premium/enable`
- `POST /v1/whatsapp/simulate-message`

