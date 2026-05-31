import { NextResponse } from "next/server";
import Stripe from "stripe";

type CreateSubscriptionCheckoutBody = {
  anonymousId?: unknown;
  email?: unknown;
};

const STRIPE_CONFIG = {
  apiVersion: "2025-02-24.acacia",
} as unknown as ConstructorParameters<typeof Stripe>[1];

export async function POST(request: Request) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    const priceId = process.env.STRIPE_MONTHLY_PRICE_ID;

    if (!secretKey || !priceId) {
      return NextResponse.json(
        { error: "缺少 STRIPE_SECRET_KEY 或 STRIPE_MONTHLY_PRICE_ID 环境变量" },
        { status: 500 },
      );
    }

    const body = (await request.json()) as CreateSubscriptionCheckoutBody;
    const anonymousId =
      typeof body.anonymousId === "string" ? body.anonymousId.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim() : "";

    if (!anonymousId) {
      return NextResponse.json(
        { error: "anonymousId 不能为空" },
        { status: 400 },
      );
    }

    const stripe = new Stripe(secretKey, {
      ...STRIPE_CONFIG,
    });
    const baseUrl = getBaseUrl(request);
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email || undefined,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        anonymousId,
      },
      subscription_data: {
        metadata: {
          anonymousId,
        },
      },
      success_url: `${baseUrl}/my-trips?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/pricing`,
    });

    return NextResponse.json({ sessionUrl: session.url });
  } catch (error) {
    console.error("create-subscription-checkout error:", error);
    return NextResponse.json(
      { error: "创建会员订阅失败，请稍后重试" },
      { status: 500 },
    );
  }
}

function getBaseUrl(request: Request) {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "");

  if (configuredBaseUrl) {
    return configuredBaseUrl;
  }

  return new URL(request.url).origin;
}
