import { NextResponse } from "next/server";
import { moduleLibrary } from "@/lib/moduleLibrary";
import { createSupabaseServerClient } from "@/lib/supabaseClient";

type RecordCompletionBody = {
  anonymousId?: unknown;
  routeId?: unknown;
  optionId?: unknown;
  moduleId?: unknown;
  moduleName?: unknown;
  category?: unknown;
  rating?: unknown;
  feedbackEmoji?: unknown;
  completedAt?: unknown;
};

const moduleById = new Map(moduleLibrary.map((module) => [module.id, module]));

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RecordCompletionBody;
    const headerAnonymousId = request.headers.get("x-anonymous-id")?.trim();
    const anonymousId =
      typeof body.anonymousId === "string" ? body.anonymousId.trim() : "";
    const routeId = typeof body.routeId === "string" ? body.routeId.trim() : "";
    const optionId =
      typeof body.optionId === "string" ? body.optionId.trim() : "";
    const moduleId =
      typeof body.moduleId === "string" ? body.moduleId.trim() : "";
    const moduleFromLibrary = moduleById.get(moduleId);
    const moduleName =
      typeof body.moduleName === "string" && body.moduleName.trim()
        ? body.moduleName.trim()
        : moduleFromLibrary?.name ?? moduleId;
    const category =
      typeof body.category === "string" && body.category.trim()
        ? body.category.trim()
        : moduleFromLibrary?.category ?? null;
    const rating = typeof body.rating === "string" ? body.rating.trim() : null;
    const feedbackEmoji =
      typeof body.feedbackEmoji === "string" && body.feedbackEmoji.trim()
        ? body.feedbackEmoji.trim()
        : rating
          ? getFeedbackEmoji(rating)
          : null;
    const completedAt =
      typeof body.completedAt === "string" && !Number.isNaN(Date.parse(body.completedAt))
        ? body.completedAt
        : new Date().toISOString();

    if (!anonymousId || !routeId || !moduleId) {
      return NextResponse.json(
        { error: "anonymousId、routeId 和 moduleId 不能为空" },
        { status: 400 },
      );
    }

    if (headerAnonymousId && headerAnonymousId !== anonymousId) {
      return NextResponse.json(
        { error: "anonymous_id 校验失败" },
        { status: 403 },
      );
    }

    const supabase = createSupabaseServerClient();
    const fullPayload = {
      user_id: anonymousId,
      route_id: routeId,
      option_id: optionId || null,
      module_id: moduleId,
      module_name: moduleName,
      category,
      rating,
      feedback_emoji: feedbackEmoji,
      completed_at: completedAt,
    };
    const { error } = await supabase.from("completed_actions").insert(fullPayload);

    if (!error) {
      return NextResponse.json({ success: true });
    }

    if (!isUnknownColumnError(error)) {
      console.error("completed_actions insert error:", error);
      return NextResponse.json(
        { error: "记录完成状态失败，请稍后重试" },
        { status: 500 },
      );
    }

    const fallbackPayload = {
      user_id: anonymousId,
      route_id: routeId,
      module_id: moduleId,
      module_name: moduleName,
      feedback_emoji: feedbackEmoji,
      completed_at: completedAt,
    };
    const { error: fallbackError } = await supabase
      .from("completed_actions")
      .insert(fallbackPayload);

    if (fallbackError) {
      console.error("completed_actions fallback insert error:", fallbackError);
      return NextResponse.json(
        { error: "记录完成状态失败，请稍后重试" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("record-completion error:", error);
    return NextResponse.json(
      { error: "记录完成状态失败，请稍后重试" },
      { status: 500 },
    );
  }
}

function getFeedbackEmoji(rating: string) {
  if (rating === "useful" || rating === "有用") {
    return "👍";
  }

  if (rating === "一般") {
    return "😐";
  }

  if (rating === "不太适合") {
    return "🙂";
  }

  return null;
}

function isUnknownColumnError(error: unknown) {
  if (!isRecord(error)) {
    return false;
  }

  return (
    error.code === "PGRST204" ||
    (typeof error.message === "string" &&
      (error.message.includes("Could not find") ||
        error.message.includes("schema cache") ||
        error.message.includes("column")))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
