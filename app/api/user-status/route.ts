import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseClient";

type UserRow = {
  subscription_status: string | null;
  membership_expires_at: string | null;
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
    const { data, error } = await supabase
      .from("users")
      .select("subscription_status, membership_expires_at")
      .eq("anonymous_id", anonymousId)
      .maybeSingle();

    if (error) {
      console.error("user-status select error:", error);
      return NextResponse.json(
        { error: "读取会员状态失败，请稍后重试" },
        { status: 500 },
      );
    }

    const user = data as UserRow | null;
    const subscriptionStatus = user?.subscription_status ?? "inactive";
    const expiresAt = user?.membership_expires_at ?? null;
    const expiresInFuture = expiresAt
      ? new Date(expiresAt).getTime() > Date.now()
      : false;
    const isMember =
      subscriptionStatus === "active" ||
      subscriptionStatus === "trialing" ||
      (subscriptionStatus === "canceled" && expiresInFuture);

    return NextResponse.json({
      isMember,
      subscriptionStatus,
      expiresAt,
    });
  } catch (error) {
    console.error("user-status error:", error);
    return NextResponse.json(
      { error: "读取会员状态失败，请稍后重试" },
      { status: 500 },
    );
  }
}
