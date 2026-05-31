import { NextResponse } from "next/server";
import Stripe from "stripe";

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

    return NextResponse.json({
      paid: session.payment_status === "paid",
    });
  } catch (error) {
    console.error("verify-payment error:", error);

    return NextResponse.json(
      { error: "验证支付状态失败，请稍后重试" },
      { status: 500 },
    );
  }
}
