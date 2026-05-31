import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createSupabaseServerClient } from "@/lib/supabaseClient";
import type { OptionId } from "@/lib/routeTypes";

const STRIPE_CONFIG = {
  apiVersion: "2025-02-24.acacia",
} as unknown as ConstructorParameters<typeof Stripe>[1];

export async function POST(request: Request) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secretKey || !webhookSecret) {
    return NextResponse.json(
      { error: "缺少 STRIPE_SECRET_KEY 或 STRIPE_WEBHOOK_SECRET 环境变量" },
      { status: 500 },
    );
  }

  const stripe = new Stripe(secretKey, {
    ...STRIPE_CONFIG,
  });
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "缺少 stripe-signature 请求头" },
      { status: 400 },
    );
  }

  let event: Stripe.Event;

  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("stripe webhook signature error:", error);
    return NextResponse.json({ error: "Webhook 签名验证失败" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      if (session.payment_status === "paid") {
        await recordUnlockFromSession(session);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("stripe webhook handler error:", error);
    return NextResponse.json({ error: "Webhook 处理失败" }, { status: 500 });
  }
}

async function recordUnlockFromSession(session: Stripe.Checkout.Session) {
  const routeId = session.metadata?.routeId;
  const anonymousId = session.metadata?.anonymousId;
  const optionId = normalizeOptionId(session.metadata?.optionId);

  if (!routeId || !anonymousId || !optionId) {
    throw new Error("Stripe Session metadata 缺少 routeId/anonymousId/optionId");
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("unlocks").upsert(
    {
      anonymous_id: anonymousId,
      route_id: routeId,
      option_id: optionId,
      stripe_session_id: session.id,
    },
    { onConflict: "stripe_session_id" },
  );

  if (error) {
    throw error;
  }
}

function normalizeOptionId(value: string | undefined): OptionId | null {
  return value === "A" || value === "B" ? value : null;
}
