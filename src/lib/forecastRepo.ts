import { getDatabase, getRuntimeEnvValue } from "./db";
import type { Forecast, ForecastInput } from "./types";
import { validateUsername } from "./username";

const DEFAULT_MAX_FORECASTS = 100_000;

type ForecastRow = {
  id: number;
  username: string;
  submitted_at: string;
  scale_min: number;
  scale_max: number;
  raw_path: string;
  smooth_path: string;
  monthly_checkpoints: string;
  final_price: number;
};

function rowToForecast(row: ForecastRow): Forecast {
  return {
    id: row.id,
    username: row.username,
    submittedAt: row.submitted_at,
    scaleMin: row.scale_min,
    scaleMax: row.scale_max,
    rawPath: JSON.parse(row.raw_path),
    smoothPath: JSON.parse(row.smooth_path),
    monthlyCheckpoints: JSON.parse(row.monthly_checkpoints),
    finalPrice: row.final_price
  };
}

export async function listForecasts(): Promise<Forecast[]> {
  const rows = await (await getDatabase()).all<ForecastRow>("SELECT * FROM forecasts ORDER BY id DESC");

  return rows.map(rowToForecast);
}

export async function countForecasts(): Promise<number> {
  const row = await (await getDatabase()).get<{ count: number }>("SELECT COUNT(*) AS count FROM forecasts");

  return row?.count ?? 0;
}

async function getMaxForecasts(): Promise<number> {
  const rawValue = await getRuntimeEnvValue("MAX_FORECASTS");
  const value = Number(rawValue);

  if (!rawValue || !Number.isFinite(value) || value < 1) {
    return DEFAULT_MAX_FORECASTS;
  }

  return Math.floor(value);
}

export async function hasForecastCapacity(): Promise<boolean> {
  return (await countForecasts()) < (await getMaxForecasts());
}

export async function listForecastsAfterId(afterId: number, limit: number): Promise<Forecast[]> {
  const rows = await (await getDatabase()).all<ForecastRow>(
    "SELECT * FROM forecasts WHERE id > ? ORDER BY id ASC LIMIT ?",
    [afterId, limit]
  );

  return rows.map(rowToForecast);
}

export async function findForecastByUsername(usernameValue: string): Promise<Forecast | null> {
  const validation = validateUsername(usernameValue);

  if (!validation.ok) {
    return null;
  }

  const row = await (await getDatabase()).get<ForecastRow>(
    "SELECT * FROM forecasts WHERE username = ?",
    [validation.username]
  );

  return row ? rowToForecast(row) : null;
}

export async function createForecast(input: ForecastInput): Promise<Forecast> {
  const validation = validateUsername(input.username);

  if (!validation.ok) {
    throw new Error("INVALID_USERNAME");
  }

  if (!(await hasForecastCapacity())) {
    throw new Error("FORECAST_CAP_REACHED");
  }

  const forecast: Forecast = {
    id: 0,
    username: validation.username,
    submittedAt: new Date().toISOString(),
    scaleMin: input.scaleMin,
    scaleMax: input.scaleMax,
    rawPath: input.rawPath,
    smoothPath: input.smoothPath,
    monthlyCheckpoints: input.monthlyCheckpoints,
    finalPrice: input.finalPrice
  };

  try {
    await (await getDatabase()).run(
      `INSERT INTO forecasts (
        username,
        submitted_at,
        scale_min,
        scale_max,
        raw_path,
        smooth_path,
        monthly_checkpoints,
        final_price
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        forecast.username,
        forecast.submittedAt,
        forecast.scaleMin,
        forecast.scaleMax,
        JSON.stringify(forecast.rawPath),
        JSON.stringify(forecast.smoothPath),
        JSON.stringify(forecast.monthlyCheckpoints),
        forecast.finalPrice
      ]
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new Error("DUPLICATE_USERNAME");
    }

    throw error;
  }

  return (await findForecastByUsername(forecast.username)) ?? forecast;
}
