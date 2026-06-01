import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseServerClient } from "@/lib/supabaseClient";
import { getStoredRoute } from "@/lib/routeStore";
import type { OptionId } from "@/lib/routeTypes";

const STRIPE_CONFIG = {
  apiVersion: "2025-02-24.acacia",
} as unknown as ConstructorParameters<typeof Stripe>[1];

export async function GET(request: Request) {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "缺少 STRIPE_SECRET_KEY 环境变量" },
        { status: 500 },
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      ...STRIPE_CONFIG,
    });
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json(
        { error: "缺少 session_id 参数" },
        { status: 400 },
      );
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const paid = session.payment_status === "paid";

    if (!paid) {
      return NextResponse.json({ paid: false });
    }

    const routeId = session.metadata?.routeId;
    const anonymousId = session.metadata?.anonymousId;
    const optionId = normalizeOptionId(session.metadata?.optionId);

    if (!routeId || !anonymousId || !optionId) {
      return NextResponse.json(
        { error: "Stripe Session metadata 不完整" },
        { status: 500 },
      );
    }

    const supabase = createSupabaseServerClient();
    const { error: unlockError } = await supabase.from("unlocks").upsert(
      {
        anonymous_id: anonymousId,
        route_id: routeId,
        option_id: optionId,
        stripe_session_id: session.id,
      },
      { onConflict: "stripe_session_id" },
    );

    if (unlockError) {
      console.error("verify-payment unlock insert error:", unlockError);

      return NextResponse.json(
        { error: "保存解锁记录失败，请稍后重试" },
        { status: 500 },
      );
    }

    const route = await getStoredRoute(routeId, anonymousId);

    if (!route) {
      return NextResponse.json(
        { error: "支付成功，但未找到原始路线" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      paid: true,
      route,
      paidOptionId: optionId,
      unlockedTimeline: null,
    });
  } catch (error) {
    console.error("verify-payment error:", error);

    return NextResponse.json(
      { error: "验证支付状态失败，请稍后重试" },
      { status: 500 },
    );
  }
}

function normalizeOptionId(value: string | undefined): OptionId | null {
  return value === "A" ||
    value === "B" ||
    value === "comfort" ||
    value === "shift"
    ? value
    : null;
}
