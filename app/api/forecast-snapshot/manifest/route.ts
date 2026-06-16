import { NextResponse } from "next/server";
import {
  FORECAST_MANIFEST_CACHE_SECONDS,
  getForecastSnapshotManifest
} from "@/src/lib/forecastSnapshot";

export async function GET() {
  const manifest = await getForecastSnapshotManifest();

  if (!manifest) {
    return NextResponse.json({ message: "Forecast snapshot is not ready." }, { status: 404 });
  }

  return NextResponse.json(manifest, {
    headers: {
      "Cache-Control": `public, max-age=${FORECAST_MANIFEST_CACHE_SECONDS}`
    }
  });
}
