import { describe, expect, it } from "vitest";
import { getCanvasCrowdForecasts, shouldUseDensityCanvas } from "./crowdRendering";
import type { Forecast } from "./types";

function forecast(username: string): Forecast {
  return {
    id: username.length,
    username,
    submittedAt: "2026-06-16T00:00:00.000Z",
    scaleMin: 190,
    scaleMax: 230,
    rawPath: [],
    smoothPath: [
      { x: 0.34, y: 0.5 },
      { x: 0.6, y: 0.4 },
      { x: 1, y: 0.3 }
    ],
    monthlyCheckpoints: [],
    finalPrice: 218
  };
}

describe("shouldUseDensityCanvas", () => {
  it("switches to canvas at 500 forecasts", () => {
    expect(shouldUseDensityCanvas(499)).toBe(false);
    expect(shouldUseDensityCanvas(500)).toBe(true);
  });
});

describe("getCanvasCrowdForecasts", () => {
  it("excludes the highlighted forecast from the density layer", () => {
    expect(
      getCanvasCrowdForecasts([forecast("alice"), forecast("bob"), forecast("carol")], "bob").map(
        (item) => item.username
      )
    ).toEqual(["alice", "carol"]);
  });
});
