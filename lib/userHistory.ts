import { createSupabaseServerClient } from "@/lib/supabaseClient";

type FeedbackHistoryRow = {
  module_id?: unknown;
};

export type UserHistory = {
  likedModuleIds: string[];
};

export async function getUserHistory(
  anonymousId: string,
): Promise<UserHistory> {
  const normalizedAnonymousId = anonymousId.trim();

  if (!normalizedAnonymousId) {
    return { likedModuleIds: [] };
  }

  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("feedback")
      .select("module_id")
      .eq("user_id", normalizedAnonymousId)
      .in("rating", ["useful", "有用"]);

    if (error) {
      console.error("user history select error:", error);
      return { likedModuleIds: [] };
    }

    const likedModuleIds = [
      ...new Set(
        ((data ?? []) as FeedbackHistoryRow[])
          .map((row) => row.module_id)
          .filter((moduleId): moduleId is string => typeof moduleId === "string")
          .map((moduleId) => moduleId.trim())
          .filter(Boolean),
      ),
    ];

    return { likedModuleIds };
  } catch (error) {
    console.error("user history error:", error);
    return { likedModuleIds: [] };
  }
}
