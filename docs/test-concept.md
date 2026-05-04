# Test Concept — Rezept-App

**Version:** 1.0  
**Date:** 2026-05-04  
**Scope:** All existing functionality + Authentication (email/password, Google OAuth, session middleware, route protection) + Per-user daily import rate limiting (FR-133: 20 imports/day, UTC reset)

---

## 1. Overview

### Testing Strategy

The Rezept-App uses a **unit-first test pyramid**: the bulk of coverage lives in fast, isolated unit tests against pure functions and API route handlers; component tests cover interactive UI behaviour; end-to-end tests are reserved for critical user flows that span the browser, network, and database.

**Principles:**
- All external dependencies (Supabase clients, Claude API, network fetches) are mocked at the module boundary.
- API routes are tested by constructing real `NextRequest` objects and asserting on the `NextResponse` — no HTTP server required.
- Component tests use React Testing Library against jsdom; they assert on visible output and user interactions, not implementation details.
- The pattern established in `recipes-confirm.test.ts` is the canonical template for all API route tests (see Section 6 for the mock pattern).

### Tools

| Layer | Tool |
|---|---|
| Test runner | Jest (configured via `jest.config.ts` / `jest.setup.ts`) |
| Component tests | React Testing Library (`@testing-library/react`) |
| DOM environment | jsdom |
| Mocking | `jest.mock()` — module-level factory mocks |
| E2E (future) | Playwright (recommended, not yet configured) |

### Test Pyramid

```
         /‾‾‾‾‾‾‾‾‾‾‾\
        /   E2E (few)  \       Playwright — full browser, real Supabase test project
       /‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\
      / Integration (mid) \    API routes with mocked DB; component trees with mocked hooks
     /‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\
    /   Unit (many, fast)   \  Pure functions, lib utilities, isolated handlers
   /‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\
```

---

## 2. Current Test Coverage Inventory

| File | Subject | What Is Covered |
|---|---|---|
| `__tests__/api/recipes-confirm.test.ts` | `POST /api/recipes/confirm` | Missing `recipe` field → 400; duplicate detection → 409; successful insert → 200; DB error → 500; multi-section flattening; `sourceTitle` persistence; `scalable` default |
| `__tests__/api/normalize-tags.test.ts` | `POST /api/admin/normalize-tags` | Empty recipe list; null data; already-canonical tags (no update); synonym normalization; before/after change log; deduplication; DB fetch error → 500 |
| `__tests__/lib/duplicate-check.test.ts` | `checkUrlDuplicate`, `findDuplicateRecipe` | No match; exact URL match; UTM-stripped URL match; different normalized URL (no match); non-HTTP source (single DB call); exact source_value match; fuzzy title ≥ 85%; fuzzy below threshold; short-word skip |
| `__tests__/lib/amounts.test.ts` | `buildInlineAmountsPreamble`, `buildKnownAmountsPreamble`, `UNICODE_FRACTIONS` | Unit conversions (EL, TL, Prise, l, ml, g, kg); comma decimals; multi-line; preamble header text; zero/negative skip; parenthetical metric amounts; unicode fractions (½ ¼ ¾ ⅛); millilitres/gram spelling variants |
| `__tests__/lib/tags.test.ts` | `normalizeTag`, `normalizeTags` | Dietary, cuisine, meal-type, difficulty, cooking-method synonyms; unknown passthrough; whitespace/punctuation cleanup; case-insensitivity; array deduplication; empty-string filter; order preservation |
| `__tests__/components/CookMode.test.tsx` | `<CookMode>` component | Step navigation (next/back/disabled); step counter display; "Fertig!" link; timer display/hide; countdown tick; pause/resume; reset; step change resets timer; ingredients accordion (toggle, serving count, singular/plural) |

**Not currently covered:** authentication flows, rate limiting, import-url route, import-youtube route, import-photo route, middleware, auth callback, login/register/forgot-password/reset-password pages, `rateLimitErrorMessage` helper.

---

## 3. Auth Test Cases

### 3.1 Middleware Route Protection

**File:** `__tests__/middleware.test.ts`  
**Mocks required:** `@supabase/ssr` → `createServerClient` (returns a mock with `auth.getUser`)

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| MW-01 | Unauthenticated user redirected to /login | Unit | `getUser` returns `{ data: { user: null } }`; request to `/` | middleware runs | Response is a redirect to `/login` (302) |
| MW-02 | Redirect preserves original path as query param | Unit | `getUser` returns null; request to `/recipes/abc` | middleware runs | Redirect URL is `/login?redirect=%2Frecipes%2Fabc` |
| MW-03 | Root path redirect has no `redirect` param | Unit | `getUser` returns null; request to `/` | middleware runs | Redirect URL is `/login` with no `redirect` param |
| MW-04 | Authenticated user passes through to protected route | Unit | `getUser` returns `{ data: { user: { id: "u1" } } }`; request to `/recipes` | middleware runs | Response is `NextResponse.next()` (passes through) |
| MW-05 | /login is public — unauthenticated passes through | Unit | `getUser` returns null; request to `/login` | middleware runs | Response is `NextResponse.next()` (no redirect) |
| MW-06 | /register is public — unauthenticated passes through | Unit | `getUser` returns null; request to `/register` | middleware runs | Response is `NextResponse.next()` (no redirect) |
| MW-07 | /auth/* is public | Unit | `getUser` returns null; request to `/auth/callback` | middleware runs | Response is `NextResponse.next()` (no redirect) |
| MW-08 | /shared/* is public | Unit | `getUser` returns null; request to `/shared/sometoken` | middleware runs | Response is `NextResponse.next()` (no redirect) |
| MW-09 | Logged-in user redirected away from /login | Unit | `getUser` returns a valid user; request to `/login` | middleware runs | Response is a redirect to `/` |
| MW-10 | Logged-in user redirected away from /register | Unit | `getUser` returns a valid user; request to `/register` | middleware runs | Response is a redirect to `/` |
| MW-11 | Session refresh called before route check | Unit | `getUser` returns a valid user; request to any route | middleware runs | `supabase.auth.getUser()` is called exactly once before the route decision |
| MW-12 | Static assets bypass matcher | Unit | Request to `/_next/static/chunk.js` | middleware config matcher evaluated | Route does not match; middleware is not invoked |

### 3.2 Login Form

**File:** `__tests__/components/LoginForm.test.tsx`  
**Mocks required:** `@/lib/supabase/client` → `createSupabaseBrowserClient` returning a mock with `auth.signInWithPassword` and `auth.signInWithOAuth`; `next/navigation` → `useRouter`, `useSearchParams`

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| LF-01 | Valid credentials — redirect to home | Integration | `signInWithPassword` resolves `{ error: null }`; no `redirect` param | user submits valid email + password | `router.push("/")` is called |
| LF-02 | Valid credentials with redirect param — redirect to original URL | Integration | `signInWithPassword` resolves `{ error: null }`; `redirect=/recipes` in URL | user submits form | `router.push("/recipes")` is called |
| LF-03 | Wrong password — error message shown | Integration | `signInWithPassword` resolves `{ error: { message: "Invalid login credentials" } }` | user submits form | Error message "E-Mail-Adresse oder Passwort ist falsch." appears with `role="alert"` |
| LF-04 | Email not confirmed — error message shown | Integration | `signInWithPassword` resolves `{ error: { message: "Email not confirmed" } }` | user submits form | Error message "Bitte bestätige zuerst deine E-Mail-Adresse." is shown |
| LF-05 | Rate limit hit — error message shown | Integration | `signInWithPassword` resolves `{ error: { message: "Too many requests" } }` | user submits form | Error message "Zu viele Versuche. Bitte warte kurz …" is shown |
| LF-06 | Unknown error — generic fallback message | Integration | `signInWithPassword` resolves `{ error: { message: "unexpected server error" } }` | user submits form | Fallback error "Anmeldung fehlgeschlagen. Bitte versuche es erneut." is shown |
| LF-07 | Submit button disabled while loading | Integration | `signInWithPassword` is a promise that does not resolve immediately | user clicks submit | Submit button is disabled and shows "Anmelden …" text during the pending state |
| LF-08 | Google OAuth button triggers OAuth flow | Integration | `signInWithOAuth` resolves `{ error: null }` | user clicks "Mit Google anmelden" | `signInWithOAuth` called with `{ provider: "google" }` and a `redirectTo` containing `/auth/callback` |
| LF-09 | Google OAuth failure — error message shown | Integration | `signInWithOAuth` resolves `{ error: { message: "oauth error" } }` | user clicks Google button | Error "Google-Anmeldung fehlgeschlagen. Bitte versuche es erneut." is shown |

### 3.3 Registration Form

**File:** `__tests__/components/RegisterForm.test.tsx`  
**Mocks required:** `@/lib/supabase/client` → `createSupabaseBrowserClient` with `auth.signUp` and `auth.signInWithOAuth`; `next/link`

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| RF-01 | Valid registration — success state shown | Integration | `signUp` resolves `{ error: null }`; passwords match; password ≥ 8 chars | user submits form | "Fast geschafft!" heading and email confirmation message are rendered |
| RF-02 | Password mismatch — client-side error, no API call | Integration | Passwords do not match (caught before API call) | user submits form | Error "Die Passwörter stimmen nicht überein." shown; `signUp` is NOT called |
| RF-03 | Password too short — client-side error, no API call | Integration | Password has 7 characters; passwords match | user submits form | Error "Das Passwort muss mindestens 8 Zeichen lang sein." shown; `signUp` is NOT called |
| RF-04 | Duplicate email — server error mapped correctly | Integration | `signUp` resolves `{ error: { message: "User already registered" } }` | user submits valid form | Error "Diese E-Mail-Adresse ist bereits registriert." is shown |
| RF-05 | Supabase rejects password — server error shown | Integration | `signUp` resolves `{ error: { message: "Password should be" } }` | user submits form | Error "Das Passwort muss mindestens 8 Zeichen lang sein." is shown |
| RF-06 | Invalid email — server error mapped | Integration | `signUp` resolves `{ error: { message: "invalid email" } }` | user submits form | Error "Bitte gib eine gültige E-Mail-Adresse ein." is shown |
| RF-07 | Generic server error — fallback message shown | Integration | `signUp` resolves `{ error: { message: "internal error" } }` | user submits form | Fallback "Registrierung fehlgeschlagen. Bitte versuche es erneut." is shown |
| RF-08 | Submit disabled while loading | Integration | `signUp` hangs | user clicks submit | Button is disabled and shows "Registrieren …" |
| RF-09 | Google OAuth on register page | Integration | `signInWithOAuth` resolves `{ error: null }` | user clicks Google button | `signInWithOAuth` called with `{ provider: "google" }` and `/auth/callback` redirect |

### 3.4 Password Reset Flow

**File:** `__tests__/components/ForgotPasswordForm.test.tsx`  
**Mocks required:** `@/lib/supabase/client` → `createSupabaseBrowserClient` with `auth.resetPasswordForEmail`

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| FP-01 | Valid email — success state shown | Integration | `resetPasswordForEmail` resolves `{ error: null }` | user submits email | "E-Mail verschickt" confirmation message is shown |
| FP-02 | API failure — generic error shown | Integration | `resetPasswordForEmail` resolves `{ error: { message: "..." } }` | user submits email | Error "Anfrage fehlgeschlagen. Bitte versuche es erneut." is shown |
| FP-03 | redirectTo includes /auth/reset-password | Unit | `resetPasswordForEmail` called with any email | form submitted | The second argument contains `redirectTo` ending in `/auth/reset-password` |
| FP-04 | Submit disabled while loading | Integration | API call is pending | user clicks submit | Button is disabled and shows "Senden …" |

**File:** `__tests__/components/ResetPasswordForm.test.tsx`  
**Mocks required:** `@/lib/supabase/client` → `createSupabaseBrowserClient` with `auth.updateUser`

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| RP-01 | Valid new password — success state shown | Integration | `updateUser` resolves `{ error: null }`; passwords match; ≥ 8 chars | user submits form | "Passwort geändert" heading and link to `/` are shown |
| RP-02 | Password mismatch — client-side error | Integration | Passwords do not match | user submits form | Error "Die Passwörter stimmen nicht überein." shown; `updateUser` NOT called |
| RP-03 | Password too short — client-side error | Integration | Password has 7 chars | user submits form | Error about minimum length shown; `updateUser` NOT called |
| RP-04 | Expired session — specific error mapped | Integration | `updateUser` resolves `{ error: { message: "Auth session missing" } }` | user submits form | Error "Deine Sitzung ist abgelaufen. Bitte fordere einen neuen Link an." is shown |
| RP-05 | Generic failure — fallback message | Integration | `updateUser` resolves `{ error: { message: "something else" } }` | user submits form | Fallback error message is shown |

### 3.5 Auth Callback Route

**File:** `__tests__/api/auth-callback.test.ts`  
**Mocks required:** `@/lib/supabase/server` → `createSupabaseServerClient` with `auth.exchangeCodeForSession`

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| CB-01 | Valid code — session exchanged, redirected to `next` | Unit | `exchangeCodeForSession` returns `{ error: null }`; `code=abc&next=/recipes` in query | GET request | Response redirects to `{origin}/recipes` |
| CB-02 | Valid code — defaults to / when `next` is absent | Unit | `exchangeCodeForSession` returns `{ error: null }`; only `code` in query | GET request | Response redirects to `{origin}/` |
| CB-03 | No code in query — redirect to login with error | Unit | Request has no `code` param | GET request | Response redirects to `{origin}/login?error=auth_callback_failed` |
| CB-04 | Exchange fails — redirect to login with error | Unit | `exchangeCodeForSession` returns `{ error: { message: "bad code" } }` | GET request | Response redirects to `{origin}/login?error=auth_callback_failed` |

### 3.6 Session Refresh

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| SR-01 | Middleware calls getUser on every matching request | Unit | Any authenticated request; middleware mock captures calls | request processed by middleware | `supabase.auth.getUser()` is called; refreshed session cookies are propagated in the response |
| SR-02 | Cookie forwarding: setAll writes to supabaseResponse | Unit | `setAll` is invoked by the Supabase SSR client | cookies need to be set | All cookies from `setAll` appear on the returned `supabaseResponse` |

### 3.7 Logout

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| LO-01 | Logout clears session and redirects to /login | Integration | User is authenticated; Supabase `auth.signOut` resolves without error | user clicks "Abmelden" | `signOut` is called; `router.push("/login")` or equivalent redirect occurs |
| LO-02 | After logout, protected routes redirect to /login | E2E | Session cookie cleared | user navigates to `/` | Middleware detects no user and redirects to `/login` |

---

## 4. Rate Limit Test Cases

### 4.1 `checkDailyImportLimit` (lib unit tests)

**File:** `__tests__/lib/import-rate-limit.test.ts`  
**Mocks required:** `@/lib/supabase/server` → `createSupabaseServerClient` with `auth.getUser`; `@/lib/supabase` → `supabaseAdmin` with `from().select().eq().gte()` chain returning `{ count }`

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| RL-01 | User under limit — allowed | Unit | `getUser` returns user `u1`; DB count query returns `{ count: 5 }` | `checkDailyImportLimit()` called | Returns `{ userId: "u1", allowed: true, count: 5, remaining: 15 }` |
| RL-02 | User at exactly 19 — still allowed | Unit | DB count returns `{ count: 19 }` | `checkDailyImportLimit()` called | Returns `{ allowed: true, count: 19, remaining: 1 }` |
| RL-03 | User at exactly 20 — blocked | Unit | DB count returns `{ count: 20 }` | `checkDailyImportLimit()` called | Returns `{ allowed: false, count: 20, remaining: 0 }` |
| RL-04 | User over limit (e.g. 21) — blocked, remaining is 0 | Unit | DB count returns `{ count: 21 }` | `checkDailyImportLimit()` called | Returns `{ allowed: false, count: 21, remaining: 0 }` (not negative) |
| RL-05 | Unauthenticated user — immediately blocked | Unit | `getUser` returns `{ data: { user: null } }` | `checkDailyImportLimit()` called | Returns `{ userId: null, allowed: false, count: 0, remaining: 0 }` and does NOT call `supabaseAdmin.from()` |
| RL-06 | Count query uses UTC day start | Unit | `getUser` returns a user; DB mock captures the `gte` argument | `checkDailyImportLimit()` called | The `gte` value passed to `.gte("created_at", ...)` is an ISO string with time `T00:00:00.000Z` of the current UTC day |
| RL-07 | DB count returns null — treated as 0 | Unit | DB returns `{ count: null }` | `checkDailyImportLimit()` called | Returns `{ allowed: true, count: 0, remaining: 20 }` |

**`rateLimitErrorMessage` helper:**

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| RL-08 | Unauthenticated user — returns "Nicht angemeldet" | Unit | `result.userId` is `null` | `rateLimitErrorMessage(result)` | Returns `"Nicht angemeldet"` |
| RL-09 | Authenticated and over limit — returns count message | Unit | `result.userId = "u1"`, `result.count = 20` | `rateLimitErrorMessage(result)` | Returns a string containing `"20 von 20"` and `"Mitternacht (UTC)"` |

### 4.2 `POST /api/import-url` — Rate Limit Integration

**File:** `__tests__/api/import-url-rate-limit.test.ts`  
**Mocks required:** `@/lib/import-rate-limit` → `checkDailyImportLimit`, `rateLimitErrorMessage`; full route-level deps (cheerio, claude, duplicate-check) can be mocked as no-ops

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| IU-01 | Unauthenticated — returns 401 | Integration | `checkDailyImportLimit` returns `{ allowed: false, userId: null }` | POST with any URL | Response status is `401`; body has `{ data: null, error: "Nicht angemeldet" }` |
| IU-02 | Limit reached — returns 429 | Integration | `checkDailyImportLimit` returns `{ allowed: false, userId: "u1" }` | POST with any URL | Response status is `429`; body has `{ data: null, error: <limit message> }` |
| IU-03 | Under limit — request proceeds | Integration | `checkDailyImportLimit` returns `{ allowed: true, userId: "u1" }` | POST with a valid URL | Rate limit check passes; route continues to next processing step (does not return 401/429) |

### 4.3 `POST /api/import-youtube` — Rate Limit Integration

**File:** `__tests__/api/import-youtube-rate-limit.test.ts`  
**Mocks required:** same as IU-* above; also mock `youtube-transcript` and `YOUTUBE_API_KEY`

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| IY-01 | Unauthenticated — returns 401 | Integration | `checkDailyImportLimit` returns `{ allowed: false, userId: null }` | POST with any YouTube URL | Response status is `401` |
| IY-02 | Limit reached — returns 429 | Integration | `checkDailyImportLimit` returns `{ allowed: false, userId: "u1" }` | POST with any YouTube URL | Response status is `429` |
| IY-03 | Under limit — request proceeds | Integration | `checkDailyImportLimit` returns `{ allowed: true, userId: "u1" }` | POST with a valid YouTube URL | Route continues past the rate limit check |

### 4.4 `POST /api/import-photo` — Rate Limit Integration

**File:** `__tests__/api/import-photo-rate-limit.test.ts`  
**Mocks required:** `@/lib/import-rate-limit`; `heic-convert`; `@/lib/claude`; `@/lib/supabase` storage

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| IP-01 | Unauthenticated — returns 401 | Integration | `checkDailyImportLimit` returns `{ allowed: false, userId: null }` | POST with image | Response status is `401` |
| IP-02 | Limit reached — returns 429 | Integration | `checkDailyImportLimit` returns `{ allowed: false, userId: "u1" }` | POST with image | Response status is `429` |
| IP-03 | Under limit — request proceeds | Integration | `checkDailyImportLimit` returns `{ allowed: true, userId: "u1" }` | POST with valid image content | Route continues past rate limit check |

### 4.5 `POST /api/recipes/confirm` — Rate Limit + Race Condition

**File:** `__tests__/api/recipes-confirm.test.ts` (extend existing file)  
**Mocks required:** as currently set up; additionally mock `checkDailyImportLimit` from `@/lib/import-rate-limit`

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| RC-01 | Unauthenticated — returns 401 | Integration | `checkDailyImportLimit` returns `{ allowed: false, userId: null }` | POST with valid recipe body | Response status is `401`; DB insert is NOT called |
| RC-02 | Limit reached — returns 429 | Integration | `checkDailyImportLimit` returns `{ allowed: false, userId: "u1" }` | POST with valid recipe body | Response status is `429`; DB insert is NOT called |
| RC-03 | Under limit — insert proceeds | Integration | `checkDailyImportLimit` returns `{ allowed: true, userId: "u1" }` | POST with valid recipe body | Rate limit check passes; insert is attempted |
| RC-04 | Race: second confirm after limit hit mid-flight | Integration | Two requests run concurrently: first has `allowed: true` (count 19→20), second has `allowed: false` (count = 20) | both POST concurrently | First request returns 200 (insert succeeds); second request returns 429 (blocked before insert) |

**Note on RC-04:** This tests that the limit check in `/confirm` acts as a server-side gate even when the client sends a confirm request after a prior import pushed the count to the limit. Simulate by setting the `checkDailyImportLimit` mock to return `allowed: true` on the first call and `allowed: false` on the second within the same test.

---

## 5. Gaps and Priorities

### High Priority (blocking or security-critical)

| Gap | Reason | Suggested file |
|---|---|---|
| No tests for `checkDailyImportLimit` | Core business rule (FR-133); entirely untested | `__tests__/lib/import-rate-limit.test.ts` |
| No tests for rate limit integration in any import route | 401/429 responses are untested; regression risk | `__tests__/api/import-url-rate-limit.test.ts` etc. |
| No tests for middleware route protection | Authentication gate is untested; an accidental bypass would expose all recipes | `__tests__/middleware.test.ts` |
| No tests for auth callback route | Token exchange is the critical step in all OAuth and email-link flows | `__tests__/api/auth-callback.test.ts` |
| `POST /api/recipes/confirm` does not test rate limit path | The existing suite mocks `createSupabaseServerClient` but never exercises the 401/429 branches | Extend existing `recipes-confirm.test.ts` |

### Medium Priority

| Gap | Reason | Suggested file |
|---|---|---|
| No login form tests | Error message mapping (`mapAuthError`) and loading state are untested | `__tests__/components/LoginForm.test.tsx` |
| No register form tests | Client-side validation (password mismatch, length) is untested | `__tests__/components/RegisterForm.test.tsx` |
| No forgot-password / reset-password form tests | Password reset is a complete untested user flow | `__tests__/components/ForgotPasswordForm.test.tsx`, `ResetPasswordForm.test.tsx` |
| No test for `rateLimitErrorMessage` | Simple helper but the exact message copy is relied upon by the UI | Included in `import-rate-limit.test.ts` |
| No tests for `POST /api/import-url` business logic | URL scraping, JSON-LD extraction, Claude parsing pipeline — complex and regression-prone | `__tests__/api/import-url.test.ts` |

### Low Priority (nice to have)

| Gap | Reason |
|---|---|
| E2E login flow (Playwright) | Full browser test of the Supabase OAuth redirect cycle and cookie round-trip |
| E2E import-to-confirm flow | Verify 429 is surfaced correctly in the UI when the limit is reached |
| `mapAuthError` unit tests (extracted) | Currently embedded in components; extracting and testing independently would add resilience |
| Middleware cookie forwarding (`setAll` path) | Edge case: cookie refresh propagation only verifiable with a real SSR cookie context |

---

## 6. Mock Patterns

### 6.1 Mocking `createSupabaseServerClient` (established pattern)

From `__tests__/api/recipes-confirm.test.ts`:

```typescript
jest.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: jest.fn().mockResolvedValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: "test-user-id" } },
      }),
    },
  }),
}));
```

To test the **unauthenticated case**, override the mock inside a specific test:

```typescript
import { createSupabaseServerClient } from "@/lib/supabase/server";

it("returns 401 when not authenticated", async () => {
  (createSupabaseServerClient as jest.Mock).mockResolvedValueOnce({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
    },
  });

  const req = makeRequest({ recipe: validRecipe });
  const res = await POST(req);
  expect(res.status).toBe(401);
});
```

### 6.2 Mocking `checkDailyImportLimit`

For import route and confirm route tests where rate limiting needs to be controlled independently:

```typescript
jest.mock("@/lib/import-rate-limit", () => ({
  checkDailyImportLimit: jest.fn(),
  rateLimitErrorMessage: jest.fn().mockReturnValue("Tageslimit erreicht."),
}));

import { checkDailyImportLimit } from "@/lib/import-rate-limit";
const checkRateLimitMock = checkDailyImportLimit as jest.Mock;

beforeEach(() => {
  // Default: authenticated user under limit
  checkRateLimitMock.mockResolvedValue({
    userId: "test-user-id",
    allowed: true,
    count: 5,
    remaining: 15,
  });
});
```

Override for blocked scenarios:

```typescript
checkRateLimitMock.mockResolvedValueOnce({
  userId: "test-user-id",
  allowed: false,
  count: 20,
  remaining: 0,
});
```

Override for unauthenticated:

```typescript
checkRateLimitMock.mockResolvedValueOnce({
  userId: null,
  allowed: false,
  count: 0,
  remaining: 0,
});
```

### 6.3 Mocking `supabaseAdmin` (established pattern)

From `__tests__/lib/duplicate-check.test.ts` and `__tests__/api/normalize-tags.test.ts`:

```typescript
jest.mock("@/lib/supabase", () => ({
  supabaseAdmin: { from: jest.fn() },
}));

import { supabaseAdmin } from "@/lib/supabase";
const fromMock = supabaseAdmin.from as jest.Mock;
```

For rate limit unit tests, mock the count query chain:

```typescript
function makeCountChain(count: number | null) {
  return {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockResolvedValue({ count, error: null }),
  };
}

fromMock.mockReturnValue(makeCountChain(5));
```

### 6.4 Mocking `createSupabaseBrowserClient` (for component tests)

Components use the browser client directly. Mock at module level:

```typescript
const mockSignIn = jest.fn();
const mockSignUp = jest.fn();
const mockSignOut = jest.fn();

jest.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: jest.fn().mockReturnValue({
    auth: {
      signInWithPassword: mockSignIn,
      signUp: mockSignUp,
      signOut: mockSignOut,
      signInWithOAuth: jest.fn().mockResolvedValue({ error: null }),
      resetPasswordForEmail: jest.fn().mockResolvedValue({ error: null }),
      updateUser: jest.fn().mockResolvedValue({ error: null }),
    },
  }),
}));
```

### 6.5 Mocking Next.js navigation (for client component tests)

```typescript
const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(""),
}));
```

### 6.6 Mocking the middleware's `createServerClient` from `@supabase/ssr`

The middleware imports `createServerClient` directly from `@supabase/ssr`, not from an internal wrapper. Test it by importing the middleware function and mocking the module:

```typescript
jest.mock("@supabase/ssr", () => ({
  createServerClient: jest.fn().mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: null } }),
    },
  }),
}));

import { middleware } from "@/middleware";
import { createServerClient } from "@supabase/ssr";

const mockGetUser = (createServerClient as jest.Mock)
  .mock.results[0]?.value?.auth?.getUser as jest.Mock;
```

For fine-grained per-test control, reconstruct the mock inside a `beforeEach`:

```typescript
beforeEach(() => {
  (createServerClient as jest.Mock).mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: mockUser } }),
    },
  });
});
```
