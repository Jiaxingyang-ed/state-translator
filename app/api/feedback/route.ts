import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseClient";

type FeedbackBody = {
  routeId?: unknown;
  optionId?: unknown;
  rating?: unknown;
  comment?: unknown;
  anonymousId?: unknown;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FeedbackBody;
    const routeId = typeof body.routeId === "string" ? body.routeId.trim() : "";
    const optionId =
      typeof body.optionId === "string" ? body.optionId.trim() : "";
    const rating = typeof body.rating === "string" ? body.rating.trim() : "";
    const comment =
      typeof body.comment === "string" ? body.comment.trim() : "";
    const anonymousId =
      typeof body.anonymousId === "string" ? body.anonymousId.trim() : "";

    if (!routeId || !optionId || !rating || !anonymousId) {
      return NextResponse.json(
        { error: "routeId、optionId、rating 和 anonymousId 不能为空" },
        { status: 400 },
      );
    }

    const supabase = createSupabaseServerClient();
    const { error } = await supabase.from("feedback").insert({
      user_id: anonymousId,
      route_id: routeId,
      option_id: optionId,
      rating,
      comment,
    });

    if (error) {
      console.error("feedback insert error:", error);
      return NextResponse.json(
        { error: "提交反馈失败，请稍后重试" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("feedback error:", error);
    return NextResponse.json(
      { error: "提交反馈失败，请稍后重试" },
      { status: 500 },
    );
  }
}
