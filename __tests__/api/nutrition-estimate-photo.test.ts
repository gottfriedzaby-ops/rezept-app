import { NextRequest } from "next/server";

jest.mock("@/lib/nutrition-photo-rate-limit", () => ({
  checkDailyPhotoEstimateLimit: jest.fn(),
  photoEstimateRateLimitErrorMessage: jest.fn().mockReturnValue("Tageslimit erreicht."),
}));

jest.mock("@/lib/claude", () => ({
  estimateNutritionFromPhoto: jest.fn(),
}));

jest.mock("heic-convert", () => jest.fn());

import { POST } from "@/app/api/nutrition/estimate-photo/route";
import { checkDailyPhotoEstimateLimit } from "@/lib/nutrition-photo-rate-limit";
import { estimateNutritionFromPhoto } from "@/lib/claude";

const limitMock = checkDailyPhotoEstimateLimit as jest.Mock;
const estimateMock = estimateNutritionFromPhoto as jest.Mock;

// Valid JPEG magic bytes (FF D8 FF ..), padded to >= 12 bytes for sniffImageType.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(12)]);
const NOT_AN_IMAGE = Buffer.alloc(16); // all zeros → sniff returns null

function photoRequest(bytes: Buffer, type = "image/jpeg") {
  const fd = new FormData();
  fd.append("photo", new Blob([bytes], { type }), "photo.jpg");
  return new NextRequest("http://localhost/api/nutrition/estimate-photo", {
    method: "POST",
    body: fd,
  });
}

function allow(userId: string | null = "u1") {
  limitMock.mockResolvedValueOnce({ userId, allowed: true, count: 0, remaining: 15 });
}

beforeEach(() => {
  limitMock.mockReset();
  estimateMock.mockReset();
});

describe("POST /api/nutrition/estimate-photo", () => {
  it("returns 401 when unauthenticated", async () => {
    limitMock.mockResolvedValueOnce({ userId: null, allowed: false, count: 0, remaining: 0 });
    const res = await POST(photoRequest(JPEG));
    expect(res.status).toBe(401);
    expect(estimateMock).not.toHaveBeenCalled();
  });

  it("returns 429 when the daily limit is reached", async () => {
    limitMock.mockResolvedValueOnce({ userId: "u1", allowed: false, count: 15, remaining: 0 });
    const res = await POST(photoRequest(JPEG));
    expect(res.status).toBe(429);
    expect(estimateMock).not.toHaveBeenCalled();
  });

  it("rejects an unsupported file type (magic-byte sniff)", async () => {
    allow();
    const res = await POST(photoRequest(NOT_AN_IMAGE, "image/jpeg"));
    expect(res.status).toBe(400);
    expect(estimateMock).not.toHaveBeenCalled();
  });

  it("returns the estimate on success", async () => {
    allow();
    estimateMock.mockResolvedValueOnce({
      label: "Pizza Margherita",
      kcal_per_serving: 800,
      protein_g: 30,
      carbs_g: 90,
      fat_g: 28,
    });
    const res = await POST(photoRequest(JPEG));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.label).toBe("Pizza Margherita");
    expect(body.data.kcal_per_serving).toBe(800);
    expect(estimateMock).toHaveBeenCalledWith(expect.any(String), "image/jpeg", "u1");
  });

  it("returns 422 when the estimate has no calories", async () => {
    allow();
    estimateMock.mockResolvedValueOnce({
      label: null,
      kcal_per_serving: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
    });
    const res = await POST(photoRequest(JPEG));
    const body = await res.json();
    expect(res.status).toBe(422);
    expect(body.code).toBe("ESTIMATE_FAILED");
  });

  it("rejects a file larger than 10 MB", async () => {
    allow();
    const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(10 * 1024 * 1024 + 1)]);
    const res = await POST(photoRequest(big));
    expect(res.status).toBe(400);
    expect(estimateMock).not.toHaveBeenCalled();
  });
});
