import { NextResponse } from "next/server";
import { getStoredRoute } from "@/lib/routeStore";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const routeId = searchParams.get("routeId");
    const anonymousId = searchParams.get("anonymousId");

    if (!routeId || !anonymousId) {
      return NextResponse.json(
        { error: "缺少 routeId 或 anonymousId 参数" },
        { status: 400 },
      );
    }

    const route = await getStoredRoute(routeId, anonymousId);

    if (!route) {
      return NextResponse.json({ error: "路线不存在" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: route });
  } catch (error) {
    console.error("generated-route error:", error);

    return NextResponse.json(
      { error: "读取路线失败，请稍后重试" },
      { status: 500 },
    );
  }
}
