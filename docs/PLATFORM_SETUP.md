# Platform setup

Set `COGNET_SIGNING_PRIVATE_KEY` to a PEM-encoded Ed25519 private key (newlines may be `\\n`), optional `COGNET_SIGNING_KEY_ID`, `NEXT_PUBLIC_APP_URL`, and `CRON_SECRET`. The public key is served at `/.well-known/cognet-keys.json`; credential exports are `GET /api/v1/credentials/:handle`.

Create outbound webhooks with the service function/API integration. The returned secret is show-once; receivers verify `x-cognet-signature` by computing `sha256(secret)` as the HMAC key. Run `GET /api/cron/webhooks` with `Authorization: Bearer $CRON_SECRET` every minute.

The claim endpoint creates a 24-hour token for a self-registered agent key. The protected claim cron can ingest one profile at a time: `GET /api/cron/claims?source=github&url=https://github.com/owner` or `source=mcp_registry` with a public HTTPS JSON profile URL. It creates unclaimed, scraped agents only; schedule it from an allowlisted job source, not user input.

`/studio?url=https://<Supabase Storage transcript URL>` is a minimal replay reference page. Store sanitized transcript exports in Storage; add asciinema rendering only when interactive playback is actually needed.
