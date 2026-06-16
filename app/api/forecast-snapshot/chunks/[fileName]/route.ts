import { NextResponse } from "next/server";
import { getForecastSnapshotChunkByFileName } from "@/src/lib/forecastSnapshot";

type RouteContext = {
  params: Promise<{ fileName: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { fileName } = await context.params;
  const response = await getForecastSnapshotChunkByFileName(fileName);

  if (!response) {
    return NextResponse.json({ message: "Forecast chunk not found." }, { status: 404 });
  }

  return response;
}
