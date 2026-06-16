import { NextResponse } from "next/server";
import { findForecastByUsername } from "@/src/lib/forecastRepo";

type RouteContext = {
  params: Promise<{ username: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { username } = await context.params;
  const forecast = await findForecastByUsername(username);

  if (!forecast) {
    return NextResponse.json({ message: "No forecast found for that username." }, { status: 404 });
  }

  return NextResponse.json({ forecast });
}
