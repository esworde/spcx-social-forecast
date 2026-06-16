import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetDatabaseForTests } from "./db";
import { countForecasts, createForecast, findForecastByUsername, listForecasts } from "./forecastRepo";
import type { ForecastInput } from "./types";

let dataDir: string;

function input(username: string): ForecastInput {
  return {
    username,
    rawPath: [
      { x: 0.5, y: 0.6 },
      { x: 0.7, y: 0.4 },
      { x: 1, y: 0.3 }
    ],
    smoothPath: [
      { x: 0.34, y: 0.77 },
      { x: 0.7, y: 0.4 },
      { x: 1, y: 0.3 }
    ],
    monthlyCheckpoints: [{ month: "2026-12", price: 400 }],
    finalPrice: 400,
    scaleMin: 0,
    scaleMax: 1000
  };
}

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "spcx-test-"));
  process.env.SQLITE_PATH = join(dataDir, "test.sqlite");
  resetDatabaseForTests();
});

afterEach(() => {
  resetDatabaseForTests();
  rmSync(dataDir, { recursive: true, force: true });
  delete process.env.SQLITE_PATH;
  delete process.env.MAX_FORECASTS;
});

describe("forecastRepo", () => {
  it("creates and finds a forecast by normalized username", async () => {
    const created = await createForecast(input("Alice"));
    const found = await findForecastByUsername("alice");

    expect(created.username).toBe("alice");
    expect(found?.finalPrice).toBe(400);
    expect(found?.scaleMin).toBe(0);
    expect(found?.scaleMax).toBe(1000);
  });

  it("blocks duplicate usernames", async () => {
    await createForecast(input("alice"));

    await expect(createForecast(input("ALICE"))).rejects.toThrow("DUPLICATE_USERNAME");
  });

  it("lists newest forecasts first", async () => {
    await createForecast(input("alice"));
    await createForecast(input("bob"));

    expect((await listForecasts()).map((forecast) => forecast.username)).toEqual(["bob", "alice"]);
  });

  it("counts forecasts", async () => {
    await createForecast(input("alice"));
    await createForecast(input("bob"));

    expect(await countForecasts()).toBe(2);
  });

  it("blocks new forecasts when the max forecast cap is reached", async () => {
    process.env.MAX_FORECASTS = "1";

    await createForecast(input("alice"));

    await expect(createForecast(input("bob"))).rejects.toThrow("FORECAST_CAP_REACHED");
  });
});
