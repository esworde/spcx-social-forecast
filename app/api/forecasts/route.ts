import { NextResponse } from "next/server";
import {
  buildForecastPath,
  getFinalPrice,
  getMonthlyCheckpoints,
  isDrawablePathFromToday
} from "@/src/lib/forecastMath";
import { createForecast } from "@/src/lib/forecastRepo";
import { MAX_FORECAST_BODY_BYTES, validateForecastPathPayload } from "@/src/lib/forecastLimits";
import { listForecastsFromSnapshotOrDatabase } from "@/src/lib/forecastSnapshot";
import { getMarketState } from "@/src/lib/marketRepo";
import type { ChartPoint } from "@/src/lib/types";
import { validateUsername } from "@/src/lib/username";

type ForecastRequest = {
  username?: string;
  scaleMin?: number;
  scaleMax?: number;
  rawPath?: ChartPoint[];
};

function parseScale(body: ForecastRequest) {
  const min = Number(body.scaleMin);
  const max = Number(body.scaleMax);

  if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max <= min) {
    return { ok: false as const, message: "Enter a valid scale. Min cannot be below 0." };
  }

  return { ok: true as const, scale: { min, max } };
}

export async function GET() {
  const result = await listForecastsFromSnapshotOrDatabase();

  return NextResponse.json(
    { forecasts: result.forecasts },
    {
      headers: {
        "X-Forecast-Source": result.source
      }
    }
  );
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);

  if (contentLength > MAX_FORECAST_BODY_BYTES) {
    return NextResponse.json({ message: "Forecast request is too large." }, { status: 413 });
  }

  let body: ForecastRequest;

  try {
    body = (await request.json()) as ForecastRequest;
  } catch {
    return NextResponse.json({ message: "Invalid forecast request." }, { status: 400 });
  }

  const username = validateUsername(body.username ?? "");

  if (!username.ok) {
    return NextResponse.json({ message: username.message }, { status: 400 });
  }

  const pathResult = validateForecastPathPayload(body.rawPath);

  if (!pathResult.ok) {
    return NextResponse.json({ message: pathResult.message }, { status: 400 });
  }

  const rawPath = pathResult.path;
  const scaleResult = parseScale(body);

  if (!scaleResult.ok) {
    return NextResponse.json({ message: scaleResult.message }, { status: 400 });
  }

  const market = await getMarketState();

  if (!isDrawablePathFromToday(rawPath, market.todayX)) {
    return NextResponse.json({ message: "Draw a forecast first." }, { status: 400 });
  }

  const smoothPath = buildForecastPath(rawPath, scaleResult.scale, market.todayX, market.todayOpen);

  try {
    const forecast = await createForecast({
      username: username.username,
      scaleMin: scaleResult.scale.min,
      scaleMax: scaleResult.scale.max,
      rawPath,
      smoothPath,
      monthlyCheckpoints: getMonthlyCheckpoints(smoothPath, scaleResult.scale, market.todayX),
      finalPrice: getFinalPrice(smoothPath, scaleResult.scale)
    });

    return NextResponse.json({ forecast }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "DUPLICATE_USERNAME") {
      return NextResponse.json(
        { message: "That username already drew a forecast." },
        { status: 409 }
      );
    }

    if (error instanceof Error && error.message === "FORECAST_CAP_REACHED") {
      return NextResponse.json(
        { message: "Forecast submissions are paused because the forecast limit was reached." },
        { status: 503 }
      );
    }

    return NextResponse.json({ message: "Could not save forecast. Try again." }, { status: 500 });
  }
}
