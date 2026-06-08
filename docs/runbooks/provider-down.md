# Provider Down

1. Check `/api/gateway/health`.
2. Verify `provider_ready`, `mock_provider_mode`, and `provider_request_mode`.
3. Check upstream provider status and API key validity.
4. Confirm `UPSTREAM_AI_BASE_URL` and `UPSTREAM_AI_REQUEST_MODE`.
5. Review latest failed `api_usage_logs` rows for redacted provider error metadata.
