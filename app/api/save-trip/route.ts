import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseClient";

type SaveTripBody = {
  routeId?: unknown;
  optionId?: unknown;
  anonymousId?: unknown;
  anonymous_id?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SaveTripBody;
    const routeId = typeof body.routeId === "string" ? body.routeId.trim() : "";
    const anonymousId = getAnonymousId(request, body);

    if (!routeId || !anonymousId) {
      return NextResponse.json(
        { error: "routeId 和 anonymous_id 不能为空" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("saved_trips").insert({
      user_id: anonymousId,
      route_id: routeId,
    });

    if (error) {
      console.error("save-trip insert error:", error);
      return NextResponse.json(
        { error: "保存行程失败，请稍后重试" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("save-trip error:", error);
    return NextResponse.json(
      { error: "保存行程失败，请稍后重试" },
      { status: 500 },
    );
  }
}

function getAnonymousId(request: Request, body: SaveTripBody) {
  const fromBody =
    typeof body.anonymousId === "string"
      ? body.anonymousId
      : typeof body.anonymous_id === "string"
        ? body.anonymous_id
        : "";
  const fromHeader = request.headers.get("x-anonymous-id") ?? "";

  return (fromBody || fromHeader).trim();
}
