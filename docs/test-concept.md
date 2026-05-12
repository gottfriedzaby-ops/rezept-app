# Test Concept — Rezept-App

**Version:** 1.1  
**Date:** 2026-05-12  
**Scope:** All existing functionality + Authentication (email/password, Google OAuth, session middleware, route protection) + Per-user daily import rate limiting (FR-133: 20 imports/day, UTC reset) + User-scoped duplicate check + Shares API + Library Shares API + Nutrition recalculation + TagInput component + CookMode enhancements (FE-01, FE-02, FE-04, FE-05) + RecipeList enhancements (FE-03, FE-06, FE-07, FE-10)

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
| `__tests__/api/recipes-id.test.ts` | `PATCH /api/recipes/[id]`, `DELETE /api/recipes/[id]` | Auth guard → 401; successful update → 200; DB error → 500; image cleanup on delete; user ownership enforcement |
| `__tests__/lib/schemaOrg.test.ts` | `buildSchemaOrgRecipe` | schema.org/Recipe JSON-LD shape; ingredient/step serialization; multi-section flattening |
| `__tests__/lib/tag-colors.test.ts` | `getTagColor`, `getRecipeGradient`, `getTagKeys` | Known tag → correct colour; unknown tag → default; gradient for first matching tag; empty tags → default gradient; `getTagKeys` returns all known keys |
| `__tests__/components/CookMode.test.tsx` | `<CookMode>` component | Step navigation (next/back/disabled); step counter display; "Fertig!" link; timer display/hide; countdown tick; pause/resume; reset; step change resets timer; ingredients accordion (toggle, serving count, singular/plural); recipe title in header |
| `__tests__/components/RecipeDetail.test.tsx` | `<RecipeDetail>` component | Serving counter (increment/decrement/disabled); ingredient scaling; non-scalable recipes; CookMode link with servings; steps list; timer labels; step images; multi-section headers |

**Not currently covered:** authentication flows, rate limiting, import-url/youtube/photo routes, middleware, auth callback, login/register/forgot-password/reset-password pages, `rateLimitErrorMessage` helper; user-scoped duplicate check (functions exist but tests call them without `userId`); Shares API; Library Shares API; nutrition recalculation route; `TagInput` component; CookMode keyboard navigation and new FE features; RecipeList URL-bound state, expanded search, sort, and empty state.

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

**File:** `__tests__/api/recipes-confirm-rate-limit.test.ts` (separate from existing `recipes-confirm.test.ts` to avoid mock conflicts)  
**Mocks required:** `@/lib/import-rate-limit` → `checkDailyImportLimit`, `rateLimitErrorMessage`; `@/lib/supabase`; `@/lib/supabase/server`; `@/lib/duplicate-check`; `@/lib/claude` → `estimateNutrition`

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| RC-01 | Unauthenticated — returns 401 | Integration | `checkDailyImportLimit` returns `{ allowed: false, userId: null }` | POST with valid recipe body | Response status is `401`; DB insert is NOT called |
| RC-02 | Limit reached — returns 429 | Integration | `checkDailyImportLimit` returns `{ allowed: false, userId: "u1" }` | POST with valid recipe body | Response status is `429`; DB insert is NOT called |
| RC-03 | Under limit — insert proceeds | Integration | `checkDailyImportLimit` returns `{ allowed: true, userId: "u1" }` | POST with valid recipe body | Rate limit check passes; insert is attempted |
| RC-04 | Race: second confirm after limit hit mid-flight | Integration | Two requests run concurrently: first has `allowed: true` (count 19→20), second has `allowed: false` (count = 20) | both POST concurrently | First request returns 200 (insert succeeds); second request returns 429 (blocked before insert) |

**Note on RC-04:** This tests that the limit check in `/confirm` acts as a server-side gate even when the client sends a confirm request after a prior import pushed the count to the limit. Simulate by setting the `checkDailyImportLimit` mock to return `allowed: true` on the first call and `allowed: false` on the second within the same test.

---

## 5. User-Scoped Duplicate Check

The `checkUrlDuplicate` and `findDuplicateRecipe` functions were updated (Feature 09) to accept a `userId` parameter and scope all DB queries with `.eq("user_id", userId)`. The existing test file must be updated to pass `userId` and verify scoping.

**File:** `__tests__/lib/duplicate-check.test.ts` (update existing tests)  
**Change required:** All calls to `checkUrlDuplicate` and `findDuplicateRecipe` must include a `userId` argument (e.g. `"test-user-id"`). Add dedicated user-scoping tests.

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| DC-U-01 | `checkUrlDuplicate` passes userId to eq filter | Unit | DB mock captures `.eq()` calls; `userId = "user-abc"` | `checkUrlDuplicate("https://example.com", "user-abc")` | The first `.eq()` call is `("user_id", "user-abc")` |
| DC-U-02 | `findDuplicateRecipe` passes userId to all eq filters | Unit | DB mock captures `.eq()` calls; `userId = "user-abc"` | `findDuplicateRecipe("Title", "manual", "user-abc")` | Every DB query chain includes `.eq("user_id", "user-abc")` |
| DC-U-03 | Same URL returns no duplicate for a different user | Unit | DB returns `null` for `userId = "user-b"` even though a recipe with that URL exists for `"user-a"` | `checkUrlDuplicate("https://example.com", "user-b")` | Returns `null` |
| DC-U-04 | Same URL returns duplicate for the owning user | Unit | DB returns `{ id: "abc", title: "T" }` when queried with `userId = "user-a"` | `checkUrlDuplicate("https://example.com", "user-a")` | Returns `{ existingRecipeId: "abc", existingTitle: "T" }` |

---

## 6. Shares API

**File:** `__tests__/api/shares.test.ts`  
**Mocks required:** `@/lib/supabase/server` → `createSupabaseServerClient` with `auth.getUser`; `@/lib/supabase` → `supabaseAdmin` with `from` chain; `crypto` is not mocked (uses the real randomBytes)

### 6.1 `GET /api/shares`

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| SH-01 | Unauthenticated — returns 401 | Integration | `getUser` returns `null` | GET request | Response status 401; `{ data: null, error: "Nicht angemeldet" }` |
| SH-02 | Returns list of shares for the authenticated user | Integration | `getUser` returns `{ id: "u1" }`; DB returns two share rows ordered by `created_at` desc | GET request | Response 200; `data` array contains both shares |
| SH-03 | DB error propagates as thrown exception | Integration | DB `.order()` rejects | GET request | Route throws (or returns 500 if wrapped) |

### 6.2 `POST /api/shares`

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| SH-04 | Unauthenticated — returns 401 | Integration | `getUser` returns `null` | POST with any body | Response status 401 |
| SH-05 | Creates share with generated token and optional label | Integration | `getUser` returns `{ id: "u1" }`; DB insert resolves with the inserted row | POST `{ label: "Meine Sammlung" }` | Response 201; returned `data.token` is a non-empty string; `data.label` is `"Meine Sammlung"` |
| SH-06 | Creates share without label (label is null) | Integration | DB resolves with row where `label` is `null` | POST `{}` | Response 201; `data.label` is `null` |

### 6.3 `DELETE /api/shares/[id]`

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| SH-07 | Unauthenticated — returns 401 | Integration | `getUser` returns `null` | DELETE request | Response status 401 |
| SH-08 | Revokes share — sets revoked_at | Integration | `getUser` returns `{ id: "u1" }`; DB update resolves with `{ data: { id: "share-id" }, error: null }` | DELETE `/api/shares/share-id` | Response 200; DB `.update()` called with `{ revoked_at: expect.any(String) }` |
| SH-09 | Share not found or wrong owner — returns 404 | Integration | DB update returns `{ data: null, error: { message: "..." } }` (no row matched) | DELETE `/api/shares/other-id` | Response 404; `{ error: "Nicht gefunden" }` |

---

## 7. Library Shares API

**File:** `__tests__/api/library-shares.test.ts`  
**Mocks required:** `@/lib/supabase/server` → `createSupabaseServerClient`; `@/lib/supabase` → `supabaseAdmin` (including `auth.admin.*`); `@/lib/invitation-rate-limit` → `checkDailyInvitationLimit`, `invitationRateLimitErrorMessage`; `@/lib/email` → `sendInvitationToRegistered`, `sendInvitationToUnregistered`

### 7.1 `GET /api/library-shares`

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| LS-01 | Unauthenticated — returns 401 | Integration | `getUser` returns `null` | GET request | Response 401 |
| LS-02 | Returns active shares with enriched display names | Integration | `getUser` returns `{ id: "u1" }`; DB returns two shares; `getUserById` returns display names | GET request | Response 200; each share includes `recipient_display_name` |
| LS-03 | Share without recipient_id has null display name | Integration | Share row has `recipient_id: null` | GET request | That share's `recipient_display_name` is `null`; no auth admin call is made for it |

### 7.2 `POST /api/library-shares`

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| LS-04 | Unauthenticated — returns 401 | Integration | `getUser` returns `null` | POST with any body | Response 401 |
| LS-05 | Invalid email — returns 400 | Integration | `getUser` returns a user | POST `{ recipient_email: "not-an-email" }` | Response 400; error mentions valid email |
| LS-06 | Self-share — returns 400 | Integration | `getUser` returns `{ id: "u1", email: "me@example.com" }` | POST `{ recipient_email: "me@example.com" }` | Response 400; error mentions self-sharing |
| LS-07 | Duplicate share — returns 400 | Integration | `getUser` returns a user; `maybeSingle` returns an existing share row | POST with an email that already has a non-revoked share | Response 400; error mentions existing invitation |
| LS-08 | Rate limit reached — returns 429 | Integration | `checkDailyInvitationLimit` returns `{ allowed: false }` | POST with valid email | Response 429 |
| LS-09 | Recipient is registered — share created, registered invitation email sent | Integration | `checkDailyInvitationLimit` allows; `listUsers` returns a user with the recipient email; DB insert resolves | POST with registered user's email | Response 201; `sendInvitationToRegistered` called; `sendInvitationToUnregistered` NOT called |
| LS-10 | Recipient is unregistered — share created, unregistered invitation email sent | Integration | `checkDailyInvitationLimit` allows; `listUsers` returns no matching user; DB insert resolves | POST with unknown email | Response 201; `sendInvitationToUnregistered` called with `invitationToken`; `sendInvitationToRegistered` NOT called |
| LS-11 | DB insert failure — returns 500 | Integration | DB insert returns `{ data: null, error: { message: "DB error" } }` | POST with valid email | Response 500 |
| LS-12 | Email send failure is non-blocking | Integration | `sendInvitationToRegistered` returns `{ success: false }`; DB insert succeeds | POST with registered user's email | Response 201 (share created despite email failure) |

---

## 8. Nutrition Recalculation API

**File:** `__tests__/api/recipes-nutrition.test.ts`  
**Mocks required:** `@/lib/supabase` → `supabaseAdmin` (select + update chains); `@/lib/claude` → `estimateNutrition`

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| NR-01 | Recipe not found — returns 404 | Integration | DB select returns `{ data: null, error: { message: "no rows" } }` | POST `/api/recipes/abc/nutrition` | Response 404; `{ error: "Rezept nicht gefunden" }` |
| NR-02 | No servings — returns 400 | Integration | DB returns a recipe with `servings: 0`; ingredients are non-empty | POST | Response 400; error mentions missing servings |
| NR-03 | No ingredients — returns 400 | Integration | DB returns a recipe with `servings: 2`; all sections empty | POST | Response 400 |
| NR-04 | Successful recalculation — updates DB and returns nutrition | Integration | DB returns a valid recipe; `estimateNutrition` resolves `{ kcal_per_serving: 350, protein_g: 12, carbs_g: 45, fat_g: 8 }`; DB update resolves `{ error: null }` | POST | Response 200; `data` contains the nutrition object; `supabaseAdmin.from("recipes").update(...)` called with the correct values |
| NR-05 | Claude API failure — returns 500 | Integration | `estimateNutrition` rejects | POST | Response 500 (caught by try/catch) |
| NR-06 | Multi-section recipe — all ingredients passed to estimateNutrition | Integration | DB returns recipe with two sections, each with two ingredients (4 total) | POST | `estimateNutrition` is called with all 4 ingredients |

---

## 9. TagInput Component

**File:** `__tests__/components/TagInput.test.tsx`  
**Mocks required:** `@/lib/tag-colors` → `getTagColor` (returns predictable `{ bg, text }`), `getTagKeys` (returns a known list)

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| TI-01 | Existing tags render as coloured pills | Integration | `value={["vegetarisch", "schnell"]}` | render | Two pills are in the document; each shows the tag text |
| TI-02 | × button removes a tag | Integration | `value={["vegetarisch"]}; onChange={spy}` | user clicks × on "vegetarisch" | `onChange` called with `[]` |
| TI-03 | Enter key adds a new tag | Integration | `value={[]}; onChange={spy}` | user types "pasta" and presses Enter | `onChange` called with `["pasta"]` |
| TI-04 | Comma key adds a new tag | Integration | `value={[]}; onChange={spy}` | user types "pasta," | `onChange` called with `["pasta"]` |
| TI-05 | Backspace on empty input removes last tag | Integration | `value={["vegetarisch"]}; onChange={spy}` | user focuses input (empty) and presses Backspace | `onChange` called with `[]` |
| TI-06 | Duplicate tag is silently rejected | Integration | `value={["vegetarisch"]}; onChange={spy}` | user types "vegetarisch" and presses Enter | `onChange` NOT called (or called with the same array unchanged) |
| TI-07 | Autocomplete suggestions appear on input | Integration | `getTagKeys` returns `["vegetarisch", "vegan", "schnell"]`; `value={[]}` | user types "veg" | Dropdown lists "vegetarisch" and "vegan" |
| TI-08 | Clicking a suggestion adds the tag | Integration | Suggestions dropdown is open | user clicks "vegetarisch" | `onChange` called with `["vegetarisch"]`; input is cleared |
| TI-09 | Already-added tags are excluded from suggestions | Integration | `value={["vegetarisch"]}` | user types "veg" | "vegetarisch" does not appear in suggestions |
| TI-10 | Disabled prop disables all interactive elements | Integration | `disabled={true}; value={["schnell"]}` | render | × buttons and text input are disabled |
| TI-11 | Blur on non-empty input commits the tag | Integration | `value={[]}; onChange={spy}` | user types "pasta" and tabs away (blur) | `onChange` called with `["pasta"]` |

---

## 10. CookMode Enhancements (FE-01, FE-02, FE-04, FE-05)

**File:** `__tests__/components/CookMode.test.tsx` (extend existing file)  
**No new mocks required** beyond what already exists.

### 10.1 Keyboard Navigation (FE-01)

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| CM-K-01 | ArrowRight advances to next step | Integration | CookMode rendered on step 1 of 3 | `fireEvent.keyDown(document, { key: "ArrowRight" })` | Step counter shows "2 / 3" |
| CM-K-02 | Space advances to next step | Integration | CookMode rendered on step 1 of 3 | `fireEvent.keyDown(document, { key: " " })` | Step counter shows "2 / 3" |
| CM-K-03 | ArrowLeft goes back one step | Integration | CookMode rendered on step 2 of 3 | `fireEvent.keyDown(document, { key: "ArrowLeft" })` | Step counter shows "1 / 3" |
| CM-K-04 | ArrowRight does nothing on last step | Integration | CookMode rendered on step 3 of 3 | `fireEvent.keyDown(document, { key: "ArrowRight" })` | Step counter still shows "3 / 3" |
| CM-K-05 | ArrowLeft does nothing on first step | Integration | CookMode rendered on step 1 | `fireEvent.keyDown(document, { key: "ArrowLeft" })` | Step counter still shows "1 / 3" |

### 10.2 Progress Bar (FE-02)

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| CM-P-01 | Progress bar width is 33% on first of 3 steps | Integration | 3-step recipe, starting on step 1 | render | `[role="progressbar"] > div` has `style.width` matching `"33.333…%"` (approximately 1/3) |
| CM-P-02 | Progress bar width reaches 100% on last step | Integration | 3-step recipe | user clicks "Weiter" twice to reach step 3 | `[role="progressbar"] > div` has `style.width === "100%"` |

### 10.3 Ingredient Checklist (FE-04)

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| CM-C-01 | Clicking an ingredient marks it checked | Integration | Accordion open; ingredient "Mehl" visible | user clicks the ingredient row | The element has `aria-pressed="true"` |
| CM-C-02 | Clicking a checked ingredient un-marks it | Integration | "Mehl" is already checked (`aria-pressed="true"`) | user clicks it again | `aria-pressed` becomes `"false"` |
| CM-C-03 | Checked ingredient text has line-through style | Integration | "Mehl" is checked | render | The text element has class containing `line-through` |

### 10.4 Step Images (FE-05)

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| CM-I-01 | Step image is shown when step_images contains a URL for current step | Integration | Recipe has `step_images: ["https://example.com/step1.jpg", null]`; step 1 is active | render | An `<img>` with `src="https://example.com/step1.jpg"` is in the document |
| CM-I-02 | No image element when step_images entry is null | Integration | Recipe has `step_images: [null, "https://example.com/step2.jpg"]`; step 1 is active | render | No `<img>` element is rendered |
| CM-I-03 | Correct step image shown after navigation | Integration | Recipe has `step_images: [null, "https://example.com/step2.jpg"]` | user advances to step 2 | `<img src="https://example.com/step2.jpg">` appears |

---

## 11. RecipeList Enhancements (FE-03, FE-06, FE-07, FE-10)

**File:** `__tests__/components/RecipeList.test.tsx`  
**Mocks required:** `next/navigation` → `useSearchParams`, `useRouter`, `usePathname`; recipes prop is passed directly (no DB mock needed)

```typescript
const mockReplace = jest.fn();
jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(),
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/",
}));
import { useSearchParams } from "next/navigation";
const mockSearchParams = useSearchParams as jest.Mock;
// In each test: mockSearchParams.mockReturnValue(new URLSearchParams("..."));
```

### 11.1 Empty-State Illustration (FE-03)

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| RL-E-01 | Empty state shown when search matches nothing | Integration | 2 recipes; `?q=xxxxnotfound` in URL | render | "Nichts gefunden" heading is visible |
| RL-E-02 | "Filter zurücksetzen" button clears URL params | Integration | Empty state is visible | user clicks "Filter zurücksetzen" | `router.replace` called with a URL that has no `q`, `tag`, or `fav` params |
| RL-E-03 | Empty state not shown when list has matching recipes | Integration | `?q=Tomaten`; one recipe has "Tomaten" in title | render | "Nichts gefunden" is NOT in the document |

### 11.2 Expanded Search (FE-06)

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| RL-S-01 | Search matches recipe title | Integration | Recipe with title "Tomatensoße"; `?q=tomate` | render | Recipe card for "Tomatensoße" is visible |
| RL-S-02 | Search matches ingredient name | Integration | Recipe with ingredient `name: "Knoblauch"`; `?q=knoblauch` | render | Recipe card is visible |
| RL-S-03 | Search matches tag | Integration | Recipe with `tags: ["vegetarisch"]`; `?q=vegetar` | render | Recipe card is visible |
| RL-S-04 | Non-matching search shows empty state | Integration | No recipe matches `?q=zuckertomate` | render | Empty state is shown |

### 11.3 Sort Control (FE-07)

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| RL-O-01 | Default order is newest-first | Integration | Two recipes: one created 2026-01-01, one created 2026-03-01; `?sort=` absent | render | Recipe created 2026-03-01 appears before 2026-01-01 |
| RL-O-02 | A–Z sort orders alphabetically | Integration | Recipes "Zuppa", "Apfelkuchen"; `?sort=az` | render | "Apfelkuchen" appears before "Zuppa" in the DOM |
| RL-O-03 | Kochzeit sort orders by total time ascending | Integration | Recipe A: prep 5 + cook 10 = 15 min; Recipe B: prep 2 + cook 5 = 7 min; `?sort=time` | render | Recipe B appears before Recipe A |
| RL-O-04 | Changing sort select fires router.replace with sort param | Integration | Sort `<select>` is rendered | user selects "A–Z" option | `router.replace` called with URL containing `sort=az` |

### 11.4 URL-Bound Filter State (FE-10)

| ID | Name | Type | Given | When | Then |
|---|---|---|---|---|---|
| RL-U-01 | Search input reflects `?q` param on load | Integration | URL has `?q=pasta` | render | Search input value is `"pasta"` |
| RL-U-02 | Typing in search calls router.replace with `?q=` | Integration | URL has no `q` param | user types "pasta" in search | `router.replace` called with URL containing `q=pasta` |
| RL-U-03 | Active tag filter reflects `?tag=` param | Integration | URL has `?tag=vegetarisch` | render | "vegetarisch" tag button appears highlighted/active |
| RL-U-04 | `?fav=1` enables favourites-only filter | Integration | URL has `?fav=1`; one recipe is favourite, one is not | render | Only the favourite recipe card is visible |

---

## 12. Gaps and Priorities

### High Priority (blocking or security-critical)

| Gap | Reason | Suggested file |
|---|---|---|
| Existing `duplicate-check.test.ts` calls functions without `userId` | Scoping invariant is completely untested; a regression could cross-pollinate recipes between users | Update `__tests__/lib/duplicate-check.test.ts` (see Section 5) |
| No tests for `checkDailyImportLimit` | Core business rule (FR-133); entirely untested | `__tests__/lib/import-rate-limit.test.ts` |
| No tests for rate limit integration in any import route | 401/429 responses are untested; regression risk | `__tests__/api/import-url-rate-limit.test.ts` etc. |
| No tests for middleware route protection | Authentication gate is untested; an accidental bypass would expose all recipes | `__tests__/middleware.test.ts` |
| No tests for auth callback route | Token exchange is the critical step in all OAuth and email-link flows | `__tests__/api/auth-callback.test.ts` |
| No tests for Shares API | Share creation and revocation are untested; a bug could leak shares to wrong users | `__tests__/api/shares.test.ts` (see Section 6) |
| `POST /api/recipes/confirm` does not test rate limit path | The existing suite never exercises the 401/429 branches | Extend existing `recipes-confirm.test.ts` |

### Medium Priority

| Gap | Reason | Suggested file |
|---|---|---|
| No tests for Library Shares API | Complex flow (email, rate limit, registered vs. unregistered recipient) is untested | `__tests__/api/library-shares.test.ts` (see Section 7) |
| No tests for nutrition recalculation route | Claude integration and multi-section ingredient aggregation are untested | `__tests__/api/recipes-nutrition.test.ts` (see Section 8) |
| No tests for `TagInput` component | New shared component with autocomplete and keyboard interactions | `__tests__/components/TagInput.test.tsx` (see Section 9) |
| No tests for CookMode keyboard navigation, progress bar, checklist, step images | All FE-01/02/04/05 improvements are untested | Extend `__tests__/components/CookMode.test.tsx` (see Section 10) |
| No tests for RecipeList enhancements | FE-03/06/07/10 — URL-bound state, expanded search, sort, empty state are untested | `__tests__/components/RecipeList.test.tsx` (see Section 11) |
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
| `RecipeCover` with `next/image` (FE-08) | Hard to test image optimisation in jsdom; verify with a visual regression test or Lighthouse audit |

---

## 13. Mock Patterns

### 13.1 Mocking `createSupabaseServerClient` (established pattern)

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

### 13.2 Mocking `checkDailyImportLimit`

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

### 13.3 Mocking `supabaseAdmin` (established pattern)

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

### 13.4 Mocking `createSupabaseBrowserClient` (for component tests)

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

### 13.5 Mocking Next.js navigation (for client component tests)

```typescript
const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => new URLSearchParams(""),
}));
```

### 13.6 Mocking the middleware's `createServerClient` from `@supabase/ssr`

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

### 13.7 Mocking `useSearchParams` for URL-bound state (RecipeList and similar)

`useSearchParams` is a named export from `next/navigation`. Mock the whole module, then control the params per test via `mockReturnValue`:

```typescript
const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useSearchParams: jest.fn(),
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/",
}));

import { useSearchParams } from "next/navigation";
const mockSearchParams = useSearchParams as jest.Mock;

beforeEach(() => {
  mockReplace.mockReset();
  // Default: no active filters
  mockSearchParams.mockReturnValue(new URLSearchParams(""));
});
```

To simulate a URL with active filters in a specific test:

```typescript
mockSearchParams.mockReturnValue(new URLSearchParams("q=pasta&tag=vegetarisch&fav=1&sort=az"));
```

To assert that `router.replace` was called with the expected URL params:

```typescript
expect(mockReplace).toHaveBeenCalledWith(
  expect.stringContaining("q=pasta")
);
```

### 13.8 Mocking `estimateNutrition` from `@/lib/claude`

```typescript
jest.mock("@/lib/claude", () => ({
  estimateNutrition: jest.fn(),
}));

import { estimateNutrition } from "@/lib/claude";
const estimateNutritionMock = estimateNutrition as jest.Mock;

beforeEach(() => {
  estimateNutritionMock.mockResolvedValue({
    kcal_per_serving: 350,
    protein_g: 12,
    carbs_g: 45,
    fat_g: 8,
  });
});
```
