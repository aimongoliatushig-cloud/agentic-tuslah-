# Security Notes

## Admin Access

Admin APIs and dashboard fail closed unless `API_GATEWAY_ADMIN_TOKEN` is configured.

Local unsafe bypass is only available when all of these are true:

- `NODE_ENV` is not `production`
- `API_GATEWAY_ADMIN_TOKEN` is empty
- `API_GATEWAY_ALLOW_UNSAFE_ADMIN_DEV=true`

Dashboard browser sessions use an httpOnly signed cookie issued by `/api/admin/login`.

## API Keys

New keys use:

```text
agf_live_<keyId>_<secret>
```

Only `key_id`, hash, and preview are stored. The raw key is shown once.

## Provider Safety

Mock provider mode is disabled in production unless `API_GATEWAY_ALLOW_MOCK_PROVIDER=true`.
Provider responses are redacted/truncated unless `API_GATEWAY_STORE_RAW_PROVIDER_RESPONSE=true`.
