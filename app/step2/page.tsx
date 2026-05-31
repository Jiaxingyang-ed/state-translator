"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Step2Decision from "@/components/Step2Decision";
import type { StepConstraints } from "@/components/Step1Capture";

type Step1State = {
  input: string;
  constraints: StepConstraints;
};

export default function Step2Page() {
  return (
    <Suspense fallback={<LoadingState message="加载中..." />}>
      <Step2PageContent />
    </Suspense>
  );
}

function Step2PageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step1State, setStep1State] = useState<Step1State | null>(null);
  const [paidOptionId, setPaidOptionId] = useState<"A" | "B" | null>(null);
  const [isVerifyingPayment, setIsVerifyingPayment] = useState(false);

  const sessionId = searchParams.get("session_id");
  const optionId = normalizeOptionId(searchParams.get("optionId"));

  useEffect(() => {
    queueMicrotask(() => {
      const input = sessionStorage.getItem("step1_input");
      const storedConstraints = sessionStorage.getItem("step1_constraints");

      if (!input || !storedConstraints) {
        router.replace("/");
        return;
      }

      try {
        setStep1State({
          input,
          constraints: JSON.parse(storedConstraints) as StepConstraints,
        });
      } catch {
        router.replace("/");
      }
    });
  }, [router]);

  useEffect(() => {
    if (!sessionId || !optionId) {
      return;
    }

    queueMicrotask(() => {
      const verifyPayment = async () => {
        setIsVerifyingPayment(true);

        try {
          const response = await fetch(
            `/api/verify-payment?session_id=${encodeURIComponent(sessionId)}`,
          );
          const result = (await response.json()) as
            | { paid: boolean }
            | { error: string };

          if (!response.ok || "error" in result) {
            throw new Error(
              "error" in result ? result.error : "支付验证失败，请稍后重试",
            );
          }

          if (result.paid) {
            setPaidOptionId(optionId);
          }
        } catch (error) {
          console.error("verify payment error:", error);
          alert("支付验证失败，请稍后刷新重试。");
        } finally {
          setIsVerifyingPayment(false);
        }
      };

      void verifyPayment();
    });
  }, [optionId, sessionId]);

  if (!step1State) {
    return <LoadingState message="加载中..." />;
  }

  if (isVerifyingPayment) {
    return <LoadingState message="正在验证支付结果..." />;
  }

  return (
    <Step2Decision
      userInput={step1State.input}
      constraints={step1State.constraints}
      paidOptionId={paidOptionId}
    />
  );
}

function LoadingState({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] text-[#655b52]">
      {message}
    </main>
  );
}

function normalizeOptionId(value: string | null): "A" | "B" | null {
  return value === "A" || value === "B" ? value : null;
}
