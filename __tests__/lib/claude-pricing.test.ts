import {
  PRICING,
  computeCostUsd,
} from "@/lib/claude-pricing";

describe("computeCostUsd", () => {
  it("returns null for an unknown model", () => {
    expect(
      computeCostUsd("claude-bogus-9-9", {
        input_tokens: 1000,
        output_tokens: 500,
      }),
    ).toBeNull();
  });

  it("computes input + output for claude-sonnet-4-6", () => {
    // 1M input @ $3 + 1M output @ $15 = $18
    const cost = computeCostUsd("claude-sonnet-4-6", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(18, 6);
  });

  it("computes input + output for claude-haiku-4-5", () => {
    // 1M input @ $1 + 1M output @ $5 = $6
    const cost = computeCostUsd("claude-haiku-4-5", {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(6, 6);
  });

  it("treats null cache token fields as zero", () => {
    const cost = computeCostUsd("claude-sonnet-4-6", {
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_tokens: null,
      cache_creation_tokens: null,
    });
    // (1000 * 3 + 500 * 15) / 1_000_000 = (3000 + 7500) / 1M = 0.0105
    expect(cost).toBeCloseTo(0.0105, 9);
  });

  it("includes cache-read and cache-creation tokens when present", () => {
    // 1M cache-read @ $0.30 + 1M cache-creation @ $3.75 = $4.05
    const cost = computeCostUsd("claude-sonnet-4-6", {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_tokens: 1_000_000,
      cache_creation_tokens: 1_000_000,
    });
    expect(cost).toBeCloseTo(4.05, 6);
  });

  it("scales linearly with token count", () => {
    const a = computeCostUsd("claude-haiku-4-5", {
      input_tokens: 100_000,
      output_tokens: 100_000,
    })!;
    const b = computeCostUsd("claude-haiku-4-5", {
      input_tokens: 200_000,
      output_tokens: 200_000,
    })!;
    expect(b).toBeCloseTo(a * 2, 6);
  });

  it("PRICING covers every model currently used by lib/claude.ts", () => {
    expect(PRICING["claude-sonnet-4-6"]).toBeDefined();
    expect(PRICING["claude-haiku-4-5"]).toBeDefined();
  });
});
