type IpApiResponse = {
  city?: unknown;
  country?: unknown;
};

export type IpLocation = {
  city: string | null;
  country: string | null;
};

export async function getCityFromIP(ip?: string | null): Promise<IpLocation> {
  try {
    const normalizedIp = ip?.split(",")[0]?.trim();
    const url = normalizedIp
      ? `https://ipapi.co/${encodeURIComponent(normalizedIp)}/json/`
      : "https://ipapi.co/json/";
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return { city: null, country: null };
    }

    const data = (await response.json()) as IpApiResponse;
    const city = typeof data.city === "string" ? data.city : null;
    const country = typeof data.country === "string" ? data.country : null;

    return { city, country };
  } catch (error) {
    console.error("ip location lookup error:", error);
    return { city: null, country: null };
  }
}
