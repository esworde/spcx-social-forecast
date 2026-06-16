import { describe, expect, it } from "vitest";
import { MAX_FORECAST_POINTS, validateForecastPathPayload } from "./forecastLimits";

describe("validateForecastPathPayload", () => {
  it("accepts finite chart points", () => {
    expect(validateForecastPathPayload([{ x: 0.4, y: 0.6 }])).toEqual({
      ok: true,
      path: [{ x: 0.4, y: 0.6 }]
    });
  });

  it("rejects non-finite points", () => {
    expect(validateForecastPathPayload([{ x: Number.NaN, y: 0.5 }])).toEqual({
      ok: false,
      message: "Forecast path contains invalid points."
    });
  });

  it("rejects oversized paths", () => {
    const path = Array.from({ length: MAX_FORECAST_POINTS + 1 }, () => ({ x: 0.5, y: 0.5 }));
    const result = validateForecastPathPayload(path);

    expect(result.ok).toBe(false);
  });
});
