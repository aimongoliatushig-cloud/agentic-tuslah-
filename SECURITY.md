# Security Policy

Report security issues privately to the repository owner. Do not open public issues for leaked secrets, authentication bypasses, or billing vulnerabilities.

## Current Controls

- Admin APIs fail closed unless `API_GATEWAY_ADMIN_TOKEN` is configured, except explicit local unsafe mode.
- Dashboard access requires an httpOnly signed admin session cookie.
- Public gateway requests validate payload shape and size before provider calls.
- API keys are stored as hashes only. New keys use a queryable `key_id` plus secret format.
- Provider mock mode is disabled in production unless explicitly enabled.
- Usage and budget accounting stores redacted provider metadata by default.

## Secret Handling

Never commit `.env`, `.env.local`, Supabase service role keys, upstream provider keys, or raw client API keys.
