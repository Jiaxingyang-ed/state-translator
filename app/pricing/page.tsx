"use client";

import { useState } from "react";

type CreateSubscriptionCheckoutResponse =
  | {
      sessionUrl: string | null;
    }
  | {
      error: string;
    };

export default function PricingPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleSubscribe = async () => {
    setIsLoading(true);

    try {
      const anonymousId = getOrCreateAnonymousId();
      const response = await fetch("/api/create-subscription-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ anonymousId }),
      });
      const result =
        (await response.json()) as CreateSubscriptionCheckoutResponse;

      if (!response.ok || "error" in result) {
        throw new Error(
          "error" in result ? result.error : "会员支付初始化失败，请重试",
        );
      }

      if (!result.sessionUrl) {
        throw new Error("会员支付链接创建失败，请稍后重试");
      }

      window.location.assign(result.sessionUrl);
    } catch (error) {
      console.error("pricing subscribe error:", error);
      alert(
        error instanceof Error
          ? error.message
          : "会员支付初始化失败，请稍后重试",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#fbfaf7_0%,#edf5f1_48%,#f8eee5_100%)] px-5 py-10 sm:px-8">
      <section className="mx-auto max-w-3xl rounded-lg border border-white/70 bg-white/80 p-7 shadow-sm backdrop-blur sm:p-9">
        <p className="mb-3 text-sm text-[#7d746b]">会员订阅</p>
        <h1 className="text-4xl font-light leading-tight text-[#29231f]">
          每月解锁完整路线
        </h1>
        <p className="mt-4 text-sm leading-7 text-[#655b52]">
          适合经常需要把状态翻译成具体行动的人。会员可直接查看完整时间线，无需每次单独解锁。
        </p>
        <div className="mt-7 rounded-lg border border-[#eadfd4] bg-[#fffdfa] p-5">
          <p className="text-3xl font-light text-[#29231f]">$7.99/月</p>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-[#655b52]">
            <li>完整查看每次生成的 A/B 路线</li>
            <li>保存路线到我的行程</li>
            <li>后续可继续补充个性化反馈</li>
          </ul>
        </div>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => void handleSubscribe()}
          className="mt-7 w-full rounded-lg bg-[#2e4d48] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#243f3b] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? "正在打开支付页..." : "成为会员"}
        </button>
      </section>
    </main>
  );
}

function getOrCreateAnonymousId() {
  const storageKey = "anonymous_id";
  const legacyStorageKey = "state_translator_anonymous_id";
  const existingId =
    localStorage.getItem(storageKey) ?? localStorage.getItem(legacyStorageKey);

  if (existingId) {
    localStorage.setItem(storageKey, existingId);
    return existingId;
  }

  const newId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  localStorage.setItem(storageKey, newId);
  localStorage.setItem(legacyStorageKey, newId);

  return newId;
}
