export type GatewayErrorCode =
  | "unauthorized"
  | "usage_exhausted"
  | "model_unavailable"
  | "rate_limited"
  | "invalid_request"
  | "gateway_error";

export class GatewayError extends Error {
  readonly status: number;
  readonly code: GatewayErrorCode;

  constructor(message: string, status: number, code: GatewayErrorCode) {
    super(message);
    this.name = "GatewayError";
    this.status = status;
    this.code = code;
  }
}
