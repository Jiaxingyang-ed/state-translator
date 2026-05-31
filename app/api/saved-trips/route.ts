import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseClient";
import type { RouteOption, RouteScale, StepConstraints } from "@/lib/routeTypes";

type SavedTripRow = {
  route_id: string;
};

type GeneratedRouteRow = {
  id: string;
  user_input: string;
  constraints: StepConstraints;
  scale: RouteScale;
  translation: string;
  options: RouteOption[];
  created_at: string;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const anonymousId = searchParams.get("anonymous_id")?.trim();

    if (!anonymousId) {
      return NextResponse.json(
        { error: "anonymous_id 不能为空" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServerClient();
    const { data: savedRows, error: savedError } = await supabase
      .from("saved_trips")
      .select("*")
      .eq("user_id", anonymousId)
      .order("created_at", { ascending: false });

    if (savedError) {
      console.error("saved_trips select error:", savedError);
      return NextResponse.json(
        { error: "读取保存行程失败，请稍后重试" },
        { status: 500 },
      );
    }

    const savedTrips = (savedRows ?? []) as SavedTripRow[];
    const routeIds = [...new Set(savedTrips.map((row) => row.route_id))];

    if (routeIds.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const { data: routeRows, error: routeError } = await supabase
      .from("generated_routes")
      .select("id, user_input, constraints, scale, translation, options, created_at")
      .in("id", routeIds);

    if (routeError) {
      console.error("saved route select error:", routeError);
      return NextResponse.json(
        { error: "读取路线失败，请稍后重试" },
        { status: 500 },
      );
    }

    const routes = ((routeRows ?? []) as GeneratedRouteRow[]).map((route) => {
      const option = route.options[0];

      return {
        routeId: route.id,
        userInput: route.user_input,
        constraints: route.constraints,
        scale: route.scale ?? "tonight",
        translation: route.translation,
        optionId: option?.id ?? "A",
        title: option?.title ?? route.translation,
        firstStep: option?.firstStep ?? null,
        timeline: option?.timeline ?? [],
        createdAt: route.created_at,
      };
    });

    return NextResponse.json({ success: true, data: routes });
  } catch (error) {
    console.error("saved-trips error:", error);
    return NextResponse.json(
      { error: "读取保存行程失败，请稍后重试" },
      { status: 500 },
    );
  }
}
