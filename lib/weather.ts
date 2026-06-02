export type WeatherCondition =
  | "rain"
  | "clear"
  | "clouds"
  | "snow"
  | "drizzle"
  | "unknown";

export type WeatherSummary = {
  condition: WeatherCondition;
  temp: number | null;
};

type OpenWeatherResponse = {
  weather?: Array<{
    main?: unknown;
  }>;
  main?: {
    temp?: unknown;
  };
};

const UNKNOWN_WEATHER: WeatherSummary = {
  condition: "unknown",
  temp: null,
};

export async function getWeatherByCity(city: string): Promise<WeatherSummary> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  const normalizedCity = city.trim();

  if (!apiKey || !normalizedCity) {
    return UNKNOWN_WEATHER;
  }

  const url = new URL("https://api.openweathermap.org/data/2.5/weather");
  url.searchParams.set("q", normalizedCity);
  url.searchParams.set("appid", apiKey);
  url.searchParams.set("units", "metric");

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return UNKNOWN_WEATHER;
    }

    const data = (await response.json()) as OpenWeatherResponse;
    const rawCondition = data.weather?.[0]?.main;
    const temp = data.main?.temp;

    return {
      condition:
        typeof rawCondition === "string"
          ? normalizeCondition(rawCondition)
          : "unknown",
      temp: typeof temp === "number" ? temp : null,
    };
  } catch (error) {
    console.error("weather lookup error:", error);
    return UNKNOWN_WEATHER;
  }
}

function normalizeCondition(condition: string): WeatherCondition {
  const normalizedCondition = condition.toLowerCase();

  if (
    normalizedCondition === "rain" ||
    normalizedCondition === "clear" ||
    normalizedCondition === "clouds" ||
    normalizedCondition === "snow" ||
    normalizedCondition === "drizzle"
  ) {
    return normalizedCondition;
  }

  return "unknown";
}
