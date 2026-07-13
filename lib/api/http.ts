import { NextResponse } from "next/server";
import type { ServiceError } from "@/lib/services/agents";

// Canonical /api/v1 envelope helpers (contract §3.6) + keyset cursor codec.
// impl-2/3/4 import from here; do not fork local copies.

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

// List responses: { data, next_cursor } — keyset pagination only, never OFFSET.
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

// ------------------------------------------------------------- cursor codec
// Canonical keyset cursor: base64url of '<ISO timestamp>|<uuid>' (H2 shape).
// One codec for every paginated surface.

export type Cursor = { ts: string; id: string };

export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.ts}|${c.id}`, "utf8").toString("base64url");
}

export function decodeCursor(s: string): Cursor | null {
  try {
    const decoded = Buffer.from(s, "base64url").toString("utf8");
    const sep = decoded.indexOf("|");
    if (sep === -1) return null;
    const ts = decoded.slice(0, sep);
    const id = decoded.slice(sep + 1);
    if (!ts || !id || Number.isNaN(Date.parse(ts))) return null;
    return { ts, id };
  } catch {
    return null;
  }
}
