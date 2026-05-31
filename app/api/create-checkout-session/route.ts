import { NextResponse } from "next/server";
import Stripe from "stripe";

type CreateCheckoutSessionBody = {
  optionId?: unknown;
  planName?: unknown;
  amount?: unknown;
};

const STRIPE_CONFIG = {
  apiVersion: "2025-02-24.acacia",
} as unknown as ConstructorParameters<typeof Stripe>[1];

export async function POST(request: Request) {
  try {
    const apiKey = process.env.STRIPE_SECRET_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "缺少 STRIPE_SECRET_KEY 环境变量" },
        { status: 500 },
      );
    }

    const body = (await request.json()) as CreateCheckoutSessionBody;
    const optionId =
      typeof body.optionId === "string" ? body.optionId.trim() : "";
    const planName =
      typeof body.planName === "string" ? body.planName.trim() : "";
    const amount = typeof body.amount === "number" ? body.amount : 0;

    if (!optionId || !["A", "B"].includes(optionId)) {
      return NextResponse.json(
        { error: "optionId 必须是 A 或 B" },
        { status: 400 },
      );
    }

    if (!planName) {
      return NextResponse.json(
        { error: "planName 不能为空" },
        { status: 400 },
      );
    }

    if (!Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json(
        { error: "amount 必须是正整数美分金额" },
        { status: 400 },
      );
    }

    const stripe = new Stripe(apiKey, {
      ...STRIPE_CONFIG,
    });
    const baseUrl = getBaseUrl(request);
    const encodedOptionId = encodeURIComponent(optionId);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amount,
            product_data: {
              name: planName,
              description: `解锁 ${optionId} 路线完整时间线`,
            },
          },
        },
      ],
      metadata: {
        optionId,
        planName,
      },
      success_url: `${baseUrl}/step2?session_id={CHECKOUT_SESSION_ID}&optionId=${encodedOptionId}`,
      cancel_url: `${baseUrl}/step2`,
    });

    return NextResponse.json({
      sessionId: session.id,
      sessionUrl: session.url,
    });
  } catch (error) {
    console.error("create-checkout-session error:", error);

    return NextResponse.json(
      { error: "创建支付会话失败，请稍后重试" },
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
