import { NextResponse } from "next/server";
import { moduleLibrary } from "@/lib/moduleLibrary";
import { createSupabaseServerClient } from "@/lib/supabaseClient";

type CompletedActionRow = {
  user_id?: unknown;
  module_id?: unknown;
  module_name?: unknown;
  completed_at?: unknown;
};

type RecentCompletion = {
  anonymousIdPrefix: string;
  moduleName: string;
  completedAt: string | null;
};

const moduleNameById = new Map(moduleLibrary.map((module) => [module.id, module.name]));

export async function GET() {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("completed_actions")
      .select("user_id, module_id, module_name, completed_at")
      .order("completed_at", { ascending: false })
      .limit(1000);

    if (error) {
      console.error("social-proof select error:", error);
      return NextResponse.json(
        { error: "读取完成动态失败，请稍后重试" },
        { status: 500 },
      );
    }

    const rows = ((data ?? []) as CompletedActionRow[]).filter(
      (row) => typeof row.user_id === "string" && row.user_id.trim(),
    );
    const totalUsers = new Set(
      rows.map((row) => (row.user_id as string).trim()),
    ).size;
    const recentCompletions = rows
      .slice(0, 3)
      .map(toRecentCompletion)
      .filter(
        (completion): completion is RecentCompletion => completion !== null,
      );

    return NextResponse.json({
      totalUsers,
      recentCompletions,
    });
  } catch (error) {
    console.error("social-proof error:", error);
    return NextResponse.json(
      { error: "读取完成动态失败，请稍后重试" },
      { status: 500 },
    );
  }
}

function toRecentCompletion(row: CompletedActionRow): RecentCompletion | null {
  const anonymousId = typeof row.user_id === "string" ? row.user_id.trim() : "";

  if (!anonymousId) {
    return null;
  }

  const moduleId = typeof row.module_id === "string" ? row.module_id.trim() : "";
  const moduleName =
    typeof row.module_name === "string" && row.module_name.trim()
      ? row.module_name.trim()
      : moduleNameById.get(moduleId) ?? "一个模块";
  const completedAt =
    typeof row.completed_at === "string" && row.completed_at.trim()
      ? row.completed_at.trim()
      : null;

  return {
    anonymousIdPrefix: anonymousId.slice(0, 6),
    moduleName,
    completedAt,
  };
}
