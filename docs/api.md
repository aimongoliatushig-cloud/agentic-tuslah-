# API Gateway API

## Generate

```http
POST /api/gateway/generate
Authorization: Bearer agf_live_<keyId>_<secret>
Content-Type: application/json
```

```json
{
  "model": "deepseek-chat",
  "prompt": "Hello",
  "parameters": {
    "max_tokens": 200,
    "temperature": 0.7
  }
}
```

## Errors

Errors use a stable shape:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Invalid gateway request.",
    "details": []
  }
}
```

Common codes:

- `invalid_request`
- `unauthorized`
- `usage_exhausted`
- `rate_limited`
- `model_unavailable`
- `gateway_error`

## Limits

Payload validation:

- `model`: 1..100 chars
- `prompt`: max 20,000 chars
- `input.messages`: max 100
- `max_tokens`: 1..4096
- `temperature`: 0..2

Rate limiting is configured by:

- `API_GATEWAY_RATE_LIMIT_REQUESTS`
- `API_GATEWAY_RATE_LIMIT_WINDOW_SECONDS`
