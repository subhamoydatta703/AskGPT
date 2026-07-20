import { jsonSchema, tool } from "ai";

type WeatherUnits = "celsius" | "fahrenheit";

type WeatherInput = {
  location: string;
  units?: WeatherUnits;
};

type GeocodingResponse = {
  results?: Array<{
    name: string;
    latitude: number;
    longitude: number;
    country?: string;
    admin1?: string;
    timezone?: string;
  }>;
};

type ForecastResponse = {
  current?: {
    time: string;
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  current_units?: Record<string, string>;
};

type SearchTopic = "general" | "news";

type SearchInput = {
  query: string;
  topic?: SearchTopic;
  numResults?: number;
};

type TavilySearchResponse = {
  answer?: string;
  results?: Array<{
    title: string;
    url: string;
    content: string;
    score: number;
    published_date?: string;
  }>;
};

function describeWeatherCode(code: number) {
  const descriptions: Record<number, string> = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
  };

  return descriptions[code] ?? `Weather code ${code}`;
}

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function getCoordinates(location: string, signal?: AbortSignal) {
  const searchUrl = new URL("https://geocoding-api.open-meteo.com/v1/search");
  searchUrl.searchParams.set("name", location);
  searchUrl.searchParams.set("count", "1");
  searchUrl.searchParams.set("language", "en");
  searchUrl.searchParams.set("format", "json");

  const data = await fetchJson<GeocodingResponse>(searchUrl.toString(), signal);
  const match = data.results?.[0];

  if (!match) {
    throw new Error(`No weather location found for "${location}"`);
  }

  return match;
}

export const chatTools = {
  get_weather: tool({
    description:
      "Get current weather for a city, region, or place. Use this when the user asks about live weather, temperature, rain, wind, or current conditions.",
    inputSchema: jsonSchema<WeatherInput>({
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "City, region, or place name, for example 'Delhi' or 'San Francisco'.",
        },
        units: {
          type: "string",
          enum: ["celsius", "fahrenheit"],
          description: "Temperature unit requested by the user. Defaults to celsius.",
        },
      },
      required: ["location"],
      additionalProperties: false,
    }),
    execute: async ({ location, units = "celsius" }, { abortSignal }) => {
      const place = await getCoordinates(location, abortSignal);
      const forecastUrl = new URL("https://api.open-meteo.com/v1/forecast");
      forecastUrl.searchParams.set("latitude", String(place.latitude));
      forecastUrl.searchParams.set("longitude", String(place.longitude));
      forecastUrl.searchParams.set(
        "current",
        "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m"
      );
      forecastUrl.searchParams.set("timezone", "auto");

      if (units === "fahrenheit") {
        forecastUrl.searchParams.set("temperature_unit", "fahrenheit");
      }

      const forecast = await fetchJson<ForecastResponse>(
        forecastUrl.toString(),
        abortSignal
      );

      if (!forecast.current) {
        throw new Error(`No current weather available for "${location}"`);
      }

      const displayName = [place.name, place.admin1, place.country]
        .filter(Boolean)
        .join(", ");

      return {
        location: displayName,
        timezone: place.timezone,
        observedAt: forecast.current.time,
        condition: describeWeatherCode(forecast.current.weather_code),
        temperature: forecast.current.temperature_2m,
        temperatureUnit: forecast.current_units?.temperature_2m,
        feelsLike: forecast.current.apparent_temperature,
        humidity: forecast.current.relative_humidity_2m,
        humidityUnit: forecast.current_units?.relative_humidity_2m,
        precipitation: forecast.current.precipitation,
        precipitationUnit: forecast.current_units?.precipitation,
        windSpeed: forecast.current.wind_speed_10m,
        windSpeedUnit: forecast.current_units?.wind_speed_10m,
        source: "Open-Meteo",
      };
    },
  }),

  // NOTE: this is a plain function tool (not a provider-defined tool like
  // google.tools.googleSearch({})). @ai-sdk/google silently drops all
  // function tools (get_weather included) whenever a provider-defined tool
  // is present in the same request (see
  // https://github.com/vercel/ai/issues/13911). A plain function tool works
  // on any model and composes freely with the rest of chatTools.
  web_search: tool({
    description:
      "Search the web for current information: facts, news, scores, prices, or anything time-sensitive or not already known. Use topic 'news' for recent events (e.g. 'yesterday's match result'), 'general' otherwise.",
    inputSchema: jsonSchema<SearchInput>({
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to run.",
        },
        topic: {
          type: "string",
          enum: ["general", "news"],
          description:
            "'news' biases results toward recent, time-sensitive events. Defaults to 'general'.",
        },
        numResults: {
          type: "number",
          description: "Number of results to return (1-10). Defaults to 5.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    }),
    execute: async ({ query, topic = "general", numResults = 5 }, { abortSignal }) => {
      const apiKey = process.env.TAVILY_API_KEY;

      if (!apiKey) {
        throw new Error("Missing TAVILY_API_KEY environment variable");
      }

      const response = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortSignal,
        body: JSON.stringify({
          api_key: apiKey,
          query,
          topic,
          search_depth: "advanced",
          include_answer: "basic",
          max_results: Math.min(Math.max(numResults, 1), 10),
        }),
      });

      if (!response.ok) {
        throw new Error(`Tavily search failed with status ${response.status}`);
      }

      const data = (await response.json()) as TavilySearchResponse;

      const results = (data.results ?? []).map((item) => ({
        title: item.title,
        url: item.url,
        content: item.content,
        publishedDate: item.published_date,
      }));

      return {
        query,
        answer: data.answer,
        results,
      };
    },
  }),
};

export type ChatTools = typeof chatTools;