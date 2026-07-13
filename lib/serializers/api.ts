import { NextResponse } from "next/server";
import type { ServiceError } from "@/lib/services/agents";

// Contract §3.6: every non-2xx /api/v1 response uses this exact shape.
export type ApiErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "internal";

const STATUS: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  internal: 500,
};

export function apiError(code: ApiErrorCode, message: string): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status: STATUS[code] }
  );
}

// Contract §3.6: list responses are { data, next_cursor }, keyset only.
export function apiList<T>(data: T[], nextCursor: string | null): NextResponse {
  return NextResponse.json({ data, next_cursor: nextCursor });
}

const CODE_BY_STATUS: Record<number, ApiErrorCode> = {
  400: "invalid_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  409: "conflict",
  422: "invalid_request",
  429: "rate_limited",
};

export function serviceErrorResponse(e: ServiceError): NextResponse {
  return apiError(CODE_BY_STATUS[e.status] ?? "internal", e.message);
}
