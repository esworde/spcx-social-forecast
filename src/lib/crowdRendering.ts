import type { Forecast } from "./types";

export const DENSITY_CANVAS_THRESHOLD = 500;

export function shouldUseDensityCanvas(forecastCount: number): boolean {
  return forecastCount >= DENSITY_CANVAS_THRESHOLD;
}

export function getCanvasCrowdForecasts(forecasts: Forecast[], highlightedUsername?: string): Forecast[] {
  return forecasts.filter((forecast) => forecast.username !== highlightedUsername);
}
