// Anthropic API pricing per 1M tokens (USD). Single source of truth for the
// admin dashboard's cost computation (Feature 13).
//
// Last verified: 2026-05-19 against
// https://platform.claude.com/docs/en/docs/about-claude/pricing
//
// To update: bump the entries below and the `LAST_VERIFIED` constant. Calls
// that use a model not present here yield a `null` cost; the UI renders "—".

export const LAST_VERIFIED = "2026-05-19";

export interface ModelPricing {
  input_per_mtok: number;
  output_per_mtok: number;
  // Cache hit (read) — 0.1x base input price at standard Anthropic terms.
  cache_read_per_mtok: number;
  // 5-minute cache write — 1.25x base input price at standard Anthropic terms.
  cache_creation_per_mtok: number;
}

export const PRICING: Record<string, ModelPricing> = {
  "claude-sonnet-4-6": {
    input_per_mtok: 3.0,
    output_per_mtok: 15.0,
    cache_read_per_mtok: 0.3,
    cache_creation_per_mtok: 3.75,
  },
  "claude-haiku-4-5": {
    input_per_mtok: 1.0,
    output_per_mtok: 5.0,
    cache_read_per_mtok: 0.1,
    cache_creation_per_mtok: 1.25,
  },
};

export interface UsageTokens {
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens?: number | null;
  cache_creation_tokens?: number | null;
}

export function computeCostUsd(
  model: string,
  usage: UsageTokens,
): number | null {
  const price = PRICING[model];
  if (!price) return null;
  return (
    (usage.input_tokens * price.input_per_mtok +
      usage.output_tokens * price.output_per_mtok +
      (usage.cache_read_tokens ?? 0) * price.cache_read_per_mtok +
      (usage.cache_creation_tokens ?? 0) * price.cache_creation_per_mtok) /
    1_000_000
  );
}
