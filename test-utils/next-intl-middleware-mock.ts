import { NextResponse, type NextRequest } from "next/server";

// Jest mock for `next-intl/middleware` (mapped in jest.config.ts). The real
// locale routing is next-intl's concern; under test we pass through so the
// middleware's own auth logic can be asserted in isolation.
export default function createMiddleware(): (request: NextRequest) => NextResponse {
  return () => NextResponse.next();
}
