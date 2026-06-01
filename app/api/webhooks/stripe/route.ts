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

      if (session.mode === "subscription") {
        await recordSubscriptionFromSession(session);
      } else if (session.payment_status === "paid") {
        await recordUnlockFromSession(session);
      }
    }

    if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      await updateSubscriptionStatus(subscription);
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

async function recordSubscriptionFromSession(session: Stripe.Checkout.Session) {
  const anonymousId = session.metadata?.anonymousId;
  const customerId =
    typeof session.customer === "string" ? session.customer : session.customer?.id;

  if (!anonymousId || !customerId) {
    throw new Error("订阅 Checkout Session 缺少 anonymousId 或 customer");
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("users").upsert(
    {
      anonymous_id: anonymousId,
      stripe_customer_id: customerId,
      subscription_status: "active",
    },
    { onConflict: "anonymous_id" },
  );

  if (error) {
    throw error;
  }
}

async function updateSubscriptionStatus(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;
  const periodEnd = getSubscriptionPeriodEnd(subscription);
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .from("users")
    .update({
      subscription_status: subscription.status,
      membership_expires_at: periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : null,
    })
    .eq("stripe_customer_id", customerId);

  if (error) {
    throw error;
  }
}

function getSubscriptionPeriodEnd(subscription: Stripe.Subscription) {
  const value = (subscription as unknown as { current_period_end?: unknown })
    .current_period_end;

  return typeof value === "number" ? value : null;
}

function normalizeOptionId(value: string | undefined): OptionId | null {
  return value === "A" ||
    value === "B" ||
    value === "comfort" ||
    value === "shift"
    ? value
    : null;
}
