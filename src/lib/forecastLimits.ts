import type { ChartPoint } from "./types";

export const MAX_FORECAST_POINTS = 800;
export const MAX_FORECAST_BODY_BYTES = 128_000;

export function validateForecastPathPayload(path: unknown): {
  ok: true;
  path: ChartPoint[];
} | {
  ok: false;
  message: string;
} {
  if (!Array.isArray(path)) {
    return { ok: false, message: "Draw a forecast first." };
  }

  if (path.length > MAX_FORECAST_POINTS) {
    return { ok: false, message: `Forecast is too detailed. Keep it under ${MAX_FORECAST_POINTS} points.` };
  }

  const parsedPath: ChartPoint[] = [];

  for (const point of path) {
    if (
      typeof point !== "object" ||
      point === null ||
      !("x" in point) ||
      !("y" in point) ||
      typeof point.x !== "number" ||
      typeof point.y !== "number" ||
      !Number.isFinite(point.x) ||
      !Number.isFinite(point.y)
    ) {
      return { ok: false, message: "Forecast path contains invalid points." };
    }

    parsedPath.push({ x: point.x, y: point.y });
  }

  return { ok: true, path: parsedPath };
}
