import { NextResponse } from "next/server";
import { getMarketState } from "@/src/lib/marketRepo";

export async function GET() {
  const market = await getMarketState();

  return NextResponse.json({ market });
}
