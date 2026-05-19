# Feature 12 — Anthropic Prompt Caching for Claude API Calls

**Prompt-Caching für alle Claude-API-Aufrufe einführen, um Kosten und Latenz zu senken**

| Field | Value |
|---|---|
| Status | Caching: **Deferred** (prefix below 2048-tok minimum on every call site). Adjacent work AO-12-2 (Haiku 4.5 for nutrition): ✅ **Shipped** in PR #48. |
| Effort | **S–M** (depends on which call sites and whether prompt restructuring is accepted) |
| Priority | Medium |
| Dependencies | None — purely an internal optimization of `lib/claude.ts` |

---

## 1. Overview

The Rezept-App makes 3 Claude API calls per recipe import (parse-pass + review-pass + optional nutrition estimation) and additional standalone calls for nutrition recalculation. Every call sends a long, stable instruction prefix (the recipe schema, the parsing rules, or the review system prompt) followed by the actual variable content (URL text, image, recipe JSON, ingredient list).

Anthropic prompt caching can serve those stable prefixes from cache at ~10% of the base input-token price after the first request. Across many users sharing identical instruction text, this offers measurable cost reduction.

This feature documents the requirements for introducing prompt caching into the Claude API surface (`lib/claude.ts`) without changing any externally observable behavior of the import pipelines.

**Goal:** Reduce input-token cost on parse-pass and review-pass calls by ≥30% under realistic traffic, with no regression in recipe quality, no change to import latency from the user's perspective, and no operational risk to the import pipeline.

---

## 2. Business Requirements

### BR-12-1 — Reduce per-import Claude API cost
Each recipe import currently consumes input tokens for the stable parse-rules block (~1700 tok), the recipe schema (~50 tok), and the review-pass system prompt (~1100 tok) in addition to the variable content. With caching, those stable portions should be billed at ~10% of base price on cache hits.

### BR-12-2 — Preserve recipe-quality baseline
Caching MUST NOT change the prompts in a way that degrades extraction accuracy, German translation quality, or the per-portion division logic. Any prompt restructuring required to enable caching MUST produce token-identical instruction content (just reorganized into `system` vs. `user` blocks where applicable).

### BR-12-3 — No new operational surface
Caching is a request-level feature on the Anthropic API. No new infrastructure, no new env vars beyond what may be needed for the beta TTL, and no new failure modes that can break an import.

### BR-12-4 — Observability
The team MUST be able to verify cache effectiveness from production traffic — i.e. `cache_read_input_tokens` and `cache_creation_input_tokens` from the API response usage object must be captured in the `ClaudeCallMeta` log entry that already exists in `lib/claude.ts`.

---

## 3. Functional Requirements

### FR-12-1 — Audit baseline: identify every Claude call site

The following call sites have been identified in the codebase. Each is in scope unless explicitly excluded under §6 Out of Scope.

| # | Function | Model | File | Used by | Stable prefix | Variable tail |
|---|---|---|---|---|---|---|
| CS-1 | `parseRecipeFromText` | `claude-sonnet-4-6` | `lib/claude.ts:411` | `import-url`, `import-youtube`, `import-instagram` | `RECIPE_SCHEMA` (~50 tok) + `RULES` (~1700 tok) | JSON-LD payload or raw text (up to 15K chars); source `type`/`value`; optional title hint |
| CS-2 | `parseRecipeFromImage` | `claude-sonnet-4-6` | `lib/claude.ts:370` | `import-photo` (FormData/single base64) | Same `RECIPE_SCHEMA` + `RULES` text block (~1750 tok) | One base64 image (new per call); filename |
| CS-3 | `parseRecipeFromImages` | `claude-sonnet-4-6` | `lib/claude.ts:332` | `import-photo` (JSON/multi-URL) | Same `RECIPE_SCHEMA` + `RULES` text block (~1750 tok) | One or more image URLs; filename |
| CS-4 | `reviewAndImproveRecipe` | `claude-sonnet-4-6` | `lib/claude.ts:254` | All four import routes (URL, YouTube, Instagram, photo) | `REVIEW_SYSTEM` (~1100 tok, in `system:`) + `RECIPE_SCHEMA` header in user (~50 tok) | Recipe JSON to review |
| CS-5 | `estimateNutrition` | `claude-haiku-4-5` *(migrated from Sonnet 4.6 per AO-12-2, PR #48)* | `lib/claude.ts:521` | `recipes/confirm`, `recipes/[id]/nutrition` | Short instruction template (~150 tok) | Ingredient list |

**Daily call volume per user (worst case):** 20 imports × 3 calls + N nutrition recalculations ≈ 60–80 calls/day/user. Across all users globally the stable prefixes are byte-identical for every call of the same type, which is the cross-user cache-hit opportunity.

### FR-12-2 — Cache eligibility per call site

The system MUST evaluate cache eligibility per call site against the **2048-token Sonnet 4.6 minimum cacheable prefix**. The current state per call site:

| # | Stable prefix tokens (estimate) | Above 2048-tok minimum? | Cacheable as-is? |
|---|---|---|---|
| CS-1 `parseRecipeFromText` | ~1750 | **No** | No — silently won't cache without prompt restructuring |
| CS-2 `parseRecipeFromImage` | ~1750 (text block) + 1 image | **No** | No — same shortfall; base64 image isn't text-cacheable |
| CS-3 `parseRecipeFromImages` | ~1750 (text block) + N images | **No** | No — same shortfall |
| CS-4 `reviewAndImproveRecipe` | ~1100 (system) + ~50 (user header) ≈ ~1150 | **No** | No — well under minimum |
| CS-5 `estimateNutrition` | ~150 | **No (far below)** | No — caching is impractical at this size |

**Implication:** None of the existing call sites cross the 2048-token minimum on their own. Implementing caching requires at least one of the following:
- **(a)** Consolidate `RULES` and `REVIEW_SYSTEM` into a single shared instruction block large enough to clear the minimum, used across multiple call sites — this raises cross-user hit rates.
- **(b)** Expand the stable prefix to clear the minimum (e.g. by including additional examples / clarifications already worth having for quality).
- **(c)** Skip caching for call sites that cannot reach 2048 tokens and accept zero savings there.

**The exact path is an open decision — see OQ-12-1.**

### FR-12-3 — Cache placement: prompt restructuring requirements

For caching to function, the stable prefix MUST physically precede the variable tail in the rendered prompt. The current code violates this in CS-1, CS-2, CS-3 where the schema/rules text and the per-call source instruction are concatenated into a single string. The minimum restructuring required:

- The system MUST place all stable, byte-identical instruction text in a position that renders before any variable content. Anthropic renders `tools` → `system` → `messages` in that order, so the natural placement is a `system:` block containing the schema and rules.
- The per-call source `type`/`value` and the text/image payload MUST come after the last `cache_control` breakpoint.
- The breakpoint MUST be placed at the end of the stable prefix (last block of the `system` array or last block of a stable user-message prefix).

### FR-12-4 — Cross-call-site prefix sharing

`RECIPE_SCHEMA` and `RULES` are identical across CS-1, CS-2, and CS-3. If they are consolidated into a single `system:` block with the same exact bytes (including whitespace and ordering), one cache write will serve all three import types within the 5-minute TTL window.

The system SHOULD use exactly the same `system:` content across CS-1, CS-2, and CS-3 to maximize cross-call-site hit rate.

CS-4 (`reviewAndImproveRecipe`) uses different instructions (review checklist), so it has its own cache entry. It does not benefit from sharing with CS-1/2/3.

### FR-12-5 — TTL selection (5-minute default vs. 1-hour beta)

Anthropic offers two TTL options:
- **5-minute ephemeral** (default): write cost 1.25× base input, read cost ~0.1× base. Break-even at 2 reads.
- **1-hour ephemeral** (beta): write cost 2× base input, read cost ~0.1× base. Break-even at ≥3 reads.

User traffic for the Rezept-App is bursty and user-triggered. For a single user, the gap between two imports is often > 5 minutes (the import flow itself takes the user 30-90 seconds, but users typically don't import recipes back-to-back). **Cross-user** traffic, however, may produce many hits per 5-minute window — this is the main reason caching is viable at all.

**TTL choice is an open decision — see OQ-12-2.** Two paths:
- (a) Use 5-minute TTL only. Sufficient for cross-user hits during active hours; nothing to pay for during quiet periods.
- (b) Use 1-hour TTL (paid beta). Smooths over off-peak gaps but doubles the write premium; only justified if there is consistent cross-user traffic averaging ≥3 reads per write.

### FR-12-6 — No change to recipe output

The system MUST verify (manually and via existing Jest tests in `__tests__/`) that introducing caching does not change the model's output for the test recipes. Because caching is byte-prefix-based, the same model + same prompt bytes MUST produce the same response distribution; this is a regression-safety check, not a semantic risk.

### FR-12-7 — Cache verification

Each Claude call response includes a `usage` object with:
- `cache_creation_input_tokens` — tokens written to cache this request
- `cache_read_input_tokens` — tokens served from cache this request
- `input_tokens` — uncached tokens (full price)

The `ClaudeCallMeta` interface (currently captures `inputTokens` and `outputTokens`) MUST be extended to also capture `cache_creation_input_tokens` and `cache_read_input_tokens`. Existing log consumers MUST continue to function (additive change only).

### FR-12-8 — Failure mode: cache miss is harmless

If a cache write fails or a cache read misses, the request MUST still succeed — Anthropic transparently falls back to processing the full prompt at base price. No code path MAY assume a cache hit is required for correctness.

---

## 4. Non-Functional Requirements

### NFR-12-1 — Latency neutral or better
Caching MUST NOT increase end-to-end import latency. Cache hits typically reduce latency by reducing input-token processing time; cache writes do not measurably increase latency over the un-cached baseline.

### NFR-12-2 — TypeScript strict mode preserved
All changes to `lib/claude.ts` MUST maintain `strict: true` compliance and continue to use the `Anthropic` SDK types — no `any`, no untyped JSON shapes.

### NFR-12-3 — Backward-compatible log format
The `ClaudeCallMeta` type may add fields but MUST NOT rename or remove existing fields. Downstream consumers (none currently observable in `app/` outside `lib/claude.ts` itself, but potentially future log dashboards) must not break.

### NFR-12-4 — Cost-monitoring readiness
Once caching is live, the team MUST be able to compute, from existing logs, both: (a) cache hit rate per call site, (b) effective price per call (weighted average of cached vs. uncached tokens). No external metrics infrastructure required — log inspection is sufficient for v1.

### NFR-12-5 — Failure isolation
The Claude SDK's existing error-handling path in `claudeCreate()` MUST remain the single error boundary. Caching MUST NOT introduce new try/catch blocks or additional error types.

---

## 5. User Stories

This is a backend optimization with no user-facing surface. There are no German UI strings, no recipe-page changes, no settings to expose. Stories are framed from the developer/operator perspective.

### US-12-1 — Developer: enable caching without touching the import routes
> Als Entwickler möchte ich Prompt Caching ausschließlich in `lib/claude.ts` aktivieren, sodass die vier Import-Routen und die `confirm`/`nutrition`-Routen unverändert bleiben.

**Acceptance criteria:**
- `app/api/import-url/route.ts`, `app/api/import-youtube/route.ts`, `app/api/import-photo/route.ts`, `app/api/import-instagram/route.ts`, `app/api/recipes/confirm/route.ts`, and `app/api/recipes/[id]/nutrition/route.ts` require no changes.
- All caching logic lives in the exported functions of `lib/claude.ts`.

### US-12-2 — Operator: see cache effectiveness in logs
> Als Betreiber möchte ich für jeden Claude-Aufruf sehen, wie viele Tokens aus dem Cache gelesen bzw. neu geschrieben wurden, damit ich die Kostenwirkung der Maßnahme beurteilen kann.

**Acceptance criteria:**
- `ClaudeCallMeta` log entries include `cacheCreationInputTokens` and `cacheReadInputTokens` alongside the existing `inputTokens` field.
- A spot check on production logs after rollout shows non-zero `cacheReadInputTokens` for at least one call site.

### US-12-3 — Operator: detect cache invalidation early
> Als Betreiber möchte ich erkennen, wenn nach einem Deployment die Cache-Treffer plötzlich auf null fallen, damit ich versehentliche Prompt-Änderungen schnell finde.

**Acceptance criteria:**
- The team can grep logs / Vercel logs for `cacheReadInputTokens: 0` patterns after deploy.
- A documented rollback path exists (revert the `lib/claude.ts` change).

---

## 6. Out of Scope

The following are explicitly NOT part of this feature:

- **Caching for `estimateNutrition` (CS-5).** The prefix is ~150 tokens; it cannot reach the 2048-token minimum without contrived padding that would not be worth maintaining.
- **Caching image content (CS-2, CS-3).** Base64 image data and image URLs change per call. Image blocks support `cache_control` in theory, but realistic hit patterns for recipe imports do not include re-uploading the same image to Claude.
- **Migrating the model to Opus 4.7 or any other model.** The model stays `claude-sonnet-4-6`. Model migration is a separate decision out of scope here.
- **Adjacent (non-caching) optimizations.** Listed in §9 as "Adjacent Opportunities" for future consideration, but not part of this feature's scope. Examples:
  - Skipping the review-pass when input quality is high enough (e.g. schema.org JSON-LD source).
  - Downgrading `estimateNutrition` to a cheaper model (e.g. Haiku 4.5).
  - Trimming the `RULES` prompt for verbosity.
  - Batching nutrition estimates across multiple recipes.
  - Using the Batches API (50% cost reduction) for non-interactive workloads.
- **Pre-warming the cache** with a synthetic request at deploy time. Out of scope for v1.
- **Per-user cache key isolation.** Not needed — the cached content (rules, schema, review system prompt) contains no user-specific data.
- **Tool use / structured outputs / extended thinking.** None are currently in use; introducing them is out of scope.
- **Auth or user-facing changes.** None required.

---

## 7. Risks

### R-12-1 — Silent cache miss due to under-minimum prefix
The current stable prefix on every call site is under the 2048-token Sonnet 4.6 minimum. Adding `cache_control` markers without restructuring or expanding the prefix would silently fail — no error, zero cache reads, just a wasted code change. **Mitigation:** §FR-12-2 lists three explicit paths to address this; the implementation MUST pick one and verify with a real API call that `cache_creation_input_tokens > 0` on the first request.

### R-12-2 — Cache invalidation on prompt edits
Any byte change in `RULES`, `RECIPE_SCHEMA`, or `REVIEW_SYSTEM` — including whitespace or comment edits — invalidates the cache. The next request after such an edit pays the write premium (1.25× or 2× base price). **Mitigation:** treat the prompt strings as a stable interface; bundle prompt changes with deploys and accept the one-time write cost.

### R-12-3 — TTL waste on quiet periods
If only one user imports a recipe in a 5-minute window, the cache write is paid but never read. Net cost is +25% on that prefix for that import. **Mitigation:** for low-traffic periods the absolute cost increase is small; cross-user traffic during active hours offsets it. Monitor via logs (NFR-12-4).

### R-12-4 — Model revision breakage
A future Anthropic model revision (e.g. `claude-sonnet-4-7`) would force a full cache rebuild on first traffic to the new model. Switching the model string mid-conversation is irrelevant here (single-shot requests), but switching the model in `lib/claude.ts` would invalidate all existing cache entries. **Mitigation:** none required — this is inherent and the cost is one-time per model bump.

### R-12-5 — Determinism of JSON serialization in user content
Some call sites embed `JSON.stringify(recipe, null, 2)` (CS-4) or `JSON.stringify(cleanJsonLd)` (CS-1) in the user-message portion. These are in the **variable tail**, not the stable prefix, so non-determinism here does NOT break caching. Risk noted for completeness; no action required.

### R-12-6 — Sonnet 4.6 minimum may change
The 2048-token minimum is the documented value for Sonnet 4.6 as of this writing. If Anthropic lowers it, more call sites become cacheable; if they raise it, more restructuring is needed. **Mitigation:** verify minimum is still 2048 at implementation time.

---

## 8. Success Metrics

### SM-12-1 — Primary: input-token cost reduction
Measured over a representative one-week post-deploy window:
- Sum of `cache_read_input_tokens` × 0.1 + `cache_creation_input_tokens` × 1.25 + `input_tokens` × 1.0, divided by what the same period would have cost without caching (i.e. summed `cache_read + cache_creation + input` × 1.0).
- **Target: ≥30% reduction on the cacheable call sites (CS-1, CS-2, CS-3, CS-4).**

### SM-12-2 — Secondary: cache hit rate
- `cache_read_input_tokens / (cache_read_input_tokens + cache_creation_input_tokens + input_tokens)` averaged across cacheable call sites.
- **Target: ≥50% within 7 days of rollout.** Below this, the implementation has not produced enough cross-user/cross-import hits to be worth the complexity.

### SM-12-3 — Latency (regression check)
P50 and P95 latency of `parseRecipeFromText`, `parseRecipeFromImage`, `parseRecipeFromImages`, `reviewAndImproveRecipe` MUST NOT increase by more than 5% versus a pre-deploy baseline.

---

## 9. Adjacent Opportunities (Out of Scope, Documented for Future Reference)

These were observed during the caching audit and are noted here for future planning. None are part of this feature.

### AO-12-1 — Skip review-pass when JSON-LD is present and high-quality ✅ Shipped (PR #56, 2026-05-19)
`parseRecipeFromText` already prioritizes schema.org JSON-LD over the supplementary text when present. If the JSON-LD is complete and the parse-pass result passes a structural check (e.g. all sections have ≥1 ingredient and ≥1 step, servings is non-zero), the review-pass could be skipped entirely. This would cut one Claude call per import for the URL path — a far larger cost reduction than caching alone.

**Shipped:** `lib/canSkipReviewPass.ts` exposes `decideSkipReviewPass(parsed, jsonLd)` returning `{ skip, reason }`. The URL import route logs the decision each call so cost impact is observable in Vercel logs. Skip conditions: JSON-LD has non-empty `recipeIngredient` AND non-empty `recipeInstructions`; parse-pass output has `servings > 0`, ≥1 section, every section has ≥1 non-blank ingredient and ≥1 non-blank step. Fallback path (review applied) is unchanged for any failing condition.

### AO-12-2 — Downgrade `estimateNutrition` to Haiku 4.5 ✅ Shipped (PR #48, 2026-05-18)
Nutrition estimation is a relatively simple inference task with a short prompt. Haiku 4.5 is ~3× cheaper per input token than Sonnet 4.6 and produces acceptable accuracy for ballpark kcal/macro estimates (already disclaimed as "ca." in the UI per Feature 08). One-line model swap in `lib/claude.ts:543` — no prompt changes; the existing try/catch fallback to null nutrition preserves graceful degradation on any error.

### AO-12-3 — Trim the `RULES` prompt
The current `RULES` string (~1700 tokens) includes worked examples and edge-case clarifications. Some may be unnecessary given the maturity of Sonnet 4.6 on recipe extraction. Token reduction reduces cost on every uncached miss as well as the write-cost of the cached prefix.

### AO-12-4 — Use the Batches API for nutrition recalculation
The `recipes/[id]/nutrition` route is user-triggered but tolerant of latency (users press a button and accept a loading spinner). For bulk nutrition backfill of existing recipes, the Batches API offers 50% cost reduction at the price of asynchronous processing.

### AO-12-5 — Avoid re-encoding images as base64 in `parseRecipeFromImage`
The legacy single-image path converts the file to base64 and embeds it in the prompt; the multi-image path uses URLs. URL-based image references are cheaper to transport (smaller request body) and clearer in logs. Consolidating on the URL path is unrelated to caching but reduces request payload size.

---

## 10. Open Questions & Decisions Needed

| # | Question | Options | Impact | Owner |
|---|---|---|---|---|
| OQ-12-1 | Which call sites to enable caching on, given that none currently clear the 2048-token Sonnet 4.6 minimum on their own? | **(a)** Consolidate `RULES` + `RECIPE_SCHEMA` into a shared `system:` block and expand to ≥2048 tokens (e.g. by adding worked examples already valuable for quality); apply to CS-1, CS-2, CS-3. **(b)** Same as (a) plus separately raise `REVIEW_SYSTEM` to ≥2048 for CS-4. **(c)** Defer caching entirely until prefixes naturally grow. **(d)** Cache only CS-4 by adding worked review examples to `REVIEW_SYSTEM` until it clears 2048. | Determines whether savings are realised on parse-pass, review-pass, both, or neither | Engineering + Product |
| OQ-12-2 | TTL choice: 5-minute default vs. 1-hour extended beta? | **(a)** 5-minute only. Cheaper writes, no beta flag, sufficient for cross-user hits during active hours. **(b)** 1-hour beta. Smooths off-peak gaps, doubles write premium, requires beta header. | Cost economics under bursty per-user traffic patterns | Engineering |
| ~~OQ-12-3~~ | ~~Should adjacent optimizations (AO-12-1 to AO-12-5) be planned for the same release window as caching, or deferred to separate features?~~ | **Decided 2026-05-18:** Caching deferred (no call site clears the 2048-tok minimum without artificial padding). AO-12-2 shipped standalone (PR #48). AO-12-1 remains deferred as the next-largest lever — re-evaluate before any caching work. | — | — |
| OQ-12-4 | Acceptance threshold for SM-12-1 (≥30% cost reduction): is this the right target, or too aggressive / not aggressive enough? | Numeric — Engineering proposes 30%; Product to confirm | Defines what "success" means for the feature | Product |
| OQ-12-5 | Should the team verify cache effectiveness with a staging-environment dry run before full production rollout? | **(a)** Yes — burn a few test calls to confirm `cache_read_input_tokens > 0` before deploying to all users. **(b)** No — ship and observe in production logs. | Risk vs. velocity tradeoff | Engineering |
| OQ-12-6 | If OQ-12-1 path (a) is chosen, what content should be added to expand the prefix above 2048 tokens — and does that content also improve extraction quality? | Engineering proposal: additional worked examples for parenthetical metric values, additional negative examples for non-translation. Product to confirm content is non-controversial. | Could improve recipe quality as a side effect, or add no value beyond hitting the cache minimum | Engineering + Product |

---

## 11. Glossary

| Term | Definition |
|---|---|
| **Stable prefix** | The portion of a Claude prompt that is byte-identical across many requests — for this app, the schema, rules, and review-system prompt. Anthropic caches this prefix and serves it at ~10% of base input-token price on cache hits. |
| **Variable tail** | The portion of a Claude prompt that changes per request — for this app, the URL text, JSON-LD payload, image, or recipe JSON to review. Never cached; always billed at full input price. |
| **Cache write** | The first request to send a given prefix. Billed at 1.25× base input price (5-min TTL) or 2× (1-hour beta). |
| **Cache read** | A subsequent request that matches the prefix bytes within the TTL window. Billed at ~0.1× base input price. |
| **TTL** | Time-to-live for a cache entry. 5 minutes (default) or 1 hour (beta). |
| **Minimum cacheable prefix** | The smallest prefix Anthropic will actually cache. For Sonnet 4.6, this is 2048 tokens. Prefixes below this size will silently not cache — no error, just `cache_creation_input_tokens: 0`. |
| **Silent invalidator** | A non-deterministic element in the stable prefix (e.g. `Date.now()`, varying JSON key order, per-user IDs) that causes every request to render different prefix bytes and thus never hit cache. |
| **Cross-user hit** | A cache hit where the first user's import wrote the prefix and a different user's import within the TTL window reads it. This is the main viability case for the Rezept-App, since per-user traffic is too sparse to produce many same-user hits. |
| **Render order** | The order in which Anthropic concatenates request parts before hashing for the cache key: `tools` → `system` → `messages`. Stable content must precede variable content in this order. |
| **CS-N** | Call Site N — the numbered Claude call sites identified in FR-12-1. |

---

*Feature 12 of N — see [README.md](./README.md) for full index. This is a backend-only optimization with no UI surface, no schema changes, no new dependencies.*
