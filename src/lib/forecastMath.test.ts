import { describe, expect, it } from "vitest";
import {
  buildMarketState,
  DEFAULT_PRICE_SCALE,
  getMarketDateInNewYork,
  getTodayX,
  HISTORY_END_X,
  LAST_KNOWN_PRICE,
  priceToY,
  seededDailyCandles,
  yToPrice
} from "./marketData";
import {
  buildForecastPath,
  clampPoint,
  getForecastMonthMarkers,
  getForwardOnlyPath,
  getMonthlyCheckpoints,
  isDrawablePath,
  smoothPath
} from "./forecastMath";

describe("price conversion", () => {
  it("round trips the latest known price near the same value", () => {
    expect(yToPrice(priceToY(LAST_KNOWN_PRICE))).toBeCloseTo(LAST_KNOWN_PRICE, 1);
  });

  it("uses custom chart scale for price conversion", () => {
    const scale = { min: 0, max: 1000 };

    expect(priceToY(750, scale)).toBe(0.25);
    expect(yToPrice(0.25, scale)).toBe(750);
    expect(DEFAULT_PRICE_SCALE).toEqual({ min: 140, max: 230 });
  });
});

describe("clampPoint", () => {
  it("keeps points inside the chart bounds", () => {
    expect(clampPoint({ x: -1, y: 2 })).toEqual({ x: 0, y: 1 });
  });
});

describe("isDrawablePath", () => {
  it("requires at least four points", () => {
    expect(isDrawablePath([{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.4 }])).toBe(false);
  });

  it("rejects paths that only have enough points because of backtracking", () => {
    expect(
      isDrawablePath([
        { x: 0.55, y: 0.5 },
        { x: 0.65, y: 0.4 },
        { x: 0.6, y: 0.45 },
        { x: 0.58, y: 0.42 }
      ])
    ).toBe(false);
  });
});

describe("getForwardOnlyPath", () => {
  it("drops points that move backward in time", () => {
    expect(
      getForwardOnlyPath([
        { x: 0.5, y: 0.5 },
        { x: 0.7, y: 0.4 },
        { x: 0.62, y: 0.35 },
        { x: 0.8, y: 0.3 },
        { x: 0.76, y: 0.25 },
        { x: 0.9, y: 0.2 }
      ])
    ).toEqual([
      { x: 0.5, y: 0.5 },
      { x: 0.7, y: 0.4 },
      { x: 0.8, y: 0.3 },
      { x: 0.9, y: 0.2 }
    ]);
  });
});

describe("smoothPath", () => {
  it("returns a path with the same first and last point", () => {
    const path = [
      { x: 0.4, y: 0.6 },
      { x: 0.5, y: 0.2 },
      { x: 0.6, y: 0.4 },
      { x: 0.7, y: 0.3 }
    ];

    expect(smoothPath(path).at(0)).toEqual(path[0]);
    expect(smoothPath(path).at(-1)).toEqual(path.at(-1));
  });
});

describe("buildForecastPath", () => {
  it("forces the forecast to start from the latest known point", () => {
    const built = buildForecastPath([
      { x: 0.6, y: 0.5 },
      { x: 0.7, y: 0.4 },
      { x: 0.8, y: 0.3 },
      { x: 1, y: 0.25 }
    ]);

    expect(built[0].x).toBe(HISTORY_END_X);
    expect(yToPrice(built[0].y)).toBeCloseTo(LAST_KNOWN_PRICE, 1);
    expect(built.at(-1)?.x).toBe(1);
  });

  it("can start from the current market day and supplied start price", () => {
    const built = buildForecastPath(
      [
        { x: 0.7, y: 0.5 },
        { x: 0.8, y: 0.4 },
        { x: 0.9, y: 0.3 },
        { x: 1, y: 0.25 }
      ],
      DEFAULT_PRICE_SCALE,
      0.62,
      220
    );

    expect(built[0].x).toBe(0.62);
    expect(yToPrice(built[0].y)).toBeCloseTo(220, 1);
  });
});

describe("getMonthlyCheckpoints", () => {
  it("samples July through December 2026 checkpoints", () => {
    const path = buildForecastPath([
      { x: 0.45, y: 0.6 },
      { x: 0.55, y: 0.5 },
      { x: 0.7, y: 0.4 },
      { x: 0.85, y: 0.35 },
      { x: 1, y: 0.3 }
    ]);

    expect(getMonthlyCheckpoints(path).map((checkpoint) => checkpoint.month)).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12"
    ]);
  });

  it("samples checkpoint prices using custom scale", () => {
    const scale = { min: 0, max: 1000 };
    const path = buildForecastPath(
      [
        { x: 0.45, y: 0.7 },
        { x: 0.65, y: 0.5 },
        { x: 0.85, y: 0.25 },
        { x: 1, y: 0.1 }
      ],
      scale
    );

    expect(getMonthlyCheckpoints(path, scale).at(-1)?.price).toBeGreaterThan(800);
  });
});

describe("getForecastMonthMarkers", () => {
  it("returns monthly marker positions from July through December", () => {
    expect(getForecastMonthMarkers()).toEqual([
      { month: "2026-07", label: "Jul", x: 0.45 },
      { month: "2026-08", label: "Aug", x: 0.56 },
      { month: "2026-09", label: "Sep", x: 0.67 },
      { month: "2026-10", label: "Oct", x: 0.78 },
      { month: "2026-11", label: "Nov", x: 0.89 },
      { month: "2026-12", label: "Dec", x: 1 }
    ]);
  });
});

describe("market calendar state", () => {
  it("keeps a readable launch history zone while exposing the true calendar position", () => {
    const market = buildMarketState(seededDailyCandles, "2026-06-16");

    expect(market.todayX).toBe(HISTORY_END_X);
    expect(market.calendarTodayX).toBeLessThan(HISTORY_END_X);
    expect(market.todayOpen).toBe(200.51);
    expect(market.todayClose).toBe(216.47);
    expect(market.lastKnownPrice).toBe(200.51);
    expect(market.change).toBe(8.01);
    expect(market.changePercent).toBe(4.16);
    expect(market.historyPoints.at(-1)?.price).toBe(200.51);
    expect(market.isCurrentSession).toBe(true);
    expect(market.quoteValueLabel).toBe("Open");
  });

  it("uses the latest saved open even when the session is complete", () => {
    const market = buildMarketState(seededDailyCandles.slice(0, 2), "2026-06-16");

    expect(market.isCurrentSession).toBe(false);
    expect(market.lastKnownPrice).toBe(171.79);
    expect(market.quoteValueLabel).toBe("Open");
  });

  it("moves today forward after the calendar passes the launch history zone", () => {
    expect(getTodayX("2026-10-01").todayX).toBeGreaterThan(HISTORY_END_X);
  });

  it("uses New York calendar date for market-day defaults", () => {
    expect(getMarketDateInNewYork(new Date("2026-06-17T02:00:00.000Z"))).toBe("2026-06-16");
  });
});
