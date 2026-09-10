/**
 * Stage 3 — real weather (GET /api/weather).
 *
 * Open-Meteo for the user's configured location (Dehradun by default),
 * replacing the Stage-1 placeholder. Falls back to the static seed values
 * when Open-Meteo is unreachable.
 */
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userSettings } from "@/db/schema";
import { sessionFromRequest } from "@/server/session.util";
import { fetchOpenMeteo, type WeatherNow } from "@/server/ai.server";

const FALLBACK: WeatherNow = {
  temp: 27,
  apparent: 27,
  condition: "Partly cloudy",
  high: 31,
  low: 23,
  location: "Dehradun",
};

export async function weatherHandler(request: Request): Promise<Response> {
  const session = sessionFromRequest(request);
  if (!session) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const rows = await db
    .select()
    .from(userSettings)
    .where(eq(userSettings.userId, session.uid))
    .limit(1);
  const settings = (rows[0]?.settings ?? {}) as {
    weatherLat?: number;
    weatherLon?: number;
    weatherLocation?: string;
  };

  let weather: WeatherNow;
  try {
    weather = await fetchOpenMeteo(settings);
  } catch {
    weather = FALLBACK;
  }

  return new Response(JSON.stringify(weather), {
    headers: { "content-type": "application/json" },
  });
}
