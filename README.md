# SULTANIQZ KEY SYSTEM

A red/black key-system website with:
- Public GET KEY and VERIFY KEY page
- JOIN DISCORD button
- Automatic random key generation with configurable expiry
- Private admin login and controls
- Enable/disable key system, auto generation, Discord logs, and unique-user counter
- Discord webhook logs when a script reports successful usage
- Recent key and activity lists

## Important architecture notes

This project requires a Node.js host. GitHub Pages alone cannot run the API or protect the Discord webhook.
The JSON database is stored in `data/store.json`. Use a host with a persistent disk and set `DATA_DIR` to that disk path, otherwise data may reset when the host redeploys/restarts.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` values into your hosting environment (or a `.env` file if you use a dotenv loader).
3. Set `ADMIN_PASSWORD` to a strong unique password (12+ characters).
4. Set `TOKEN_SECRET` to a random secret of at least 32 characters.
5. Optionally set `DISCORD_WEBHOOK_URL` to a Discord channel webhook.
6. Run `npm install` then `npm start`.
7. Open `http://localhost:3000`; admin page is `http://localhost:3000/admin`.

This starter reads environment variables directly. If running locally from a `.env` file, install dotenv and add `require("dotenv").config();` at the very top of `server.js`, or set environment variables in your terminal.

## Deploy

Use a Node.js service host (for example Render or another Node host):
- Build command: `npm install`
- Start command: `npm start`
- Add environment variables from `.env.example`
- Attach persistent storage and set `DATA_DIR` to its mount path

Do not commit real passwords, token secrets, or Discord webhook URLs to GitHub.

## Discord webhook setup

In Discord, create a webhook for the channel where logs should appear, then set its URL as `DISCORD_WEBHOOK_URL` in the server's environment variables. Never place the webhook URL in `public/` files.

## Roblox script integration (server report)

The `/api/usage` endpoint expects a POST JSON body:
`{ "key": "SULTAN-ABC123-DEF456", "userId": "roblox-user-id", "username": "PlayerName" }`

The script should call this endpoint only after it has actually initialized successfully. Do not count a page visit or a key generation as a script run. The endpoint validates the key and deduplicates users by the supplied stable user ID.

A website-only key check does not automatically secure a Roblox script. Your script must call the API at runtime, and sensitive game logic should not rely on a client-only check. A client can fake a usage report, so this is an activity counter, not tamper-proof proof of execution.

## API overview

- `GET /api/public-config`
- `POST /api/get-key`
- `POST /api/verify-key` body `{ "key": "..." }`
- `POST /api/usage` body `{ "key": "...", "userId": "...", "username": "..." }`
- `POST /api/admin/login` body `{ "password": "..." }`
- Admin endpoints require `Authorization: Bearer <token>`

## Notes

- This is a complete starter project, but it is not deployed or connected to your Discord until you configure and host it.
- The default Discord invite is a placeholder. Change it in the Admin Panel.
- Protect your admin password and use HTTPS in production.
