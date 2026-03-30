# Privos Bot

Webhook bot bridging Privos chat to TVibe AI via Express server.

## Setup

```bash
cp .env.example .env
# Fill in your values
npm install
npm start
```

Register webhook on Privos pointing to `http://<host>:30001/webhook`.

## Endpoints

- `POST /webhook` — Receives Privos message events
- `GET /health` — Health check
