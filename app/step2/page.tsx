"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Step2Decision from "@/components/Step2Decision";

type StepConstraints = {
  time: string;
  budget: string;
};

type OptionId = "A" | "B";

type TimelineStep = {
  time: string;
  action: string;
  environment: string;
  tip?: string;
};

type RouteOption = {
  id: OptionId;
  title: string;
  reason: string;
  preview: string;
  firstStep: Omit<TimelineStep, "tip">;
  followingSteps: string[];
  timeline: TimelineStep[];
};

type StoredRouteData = {
  routeId: string;
  userInput: string;
  constraints: StepConstraints;
  translation: string;
  options: RouteOption[];
  unlockedOptionIds: OptionId[];
};

type Step1State = {
  input: string;
  constraints: StepConstraints;
};

type VerifyPaymentResponse =
  | {
      paid: false;
    }
  | {
      paid: true;
      route: StoredRouteData;
      paidOptionId: OptionId;
      unlockedTimeline: TimelineStep[] | null;
    }
  | {
      error: string;
    };

type GeneratedRouteResponse =
  | {
      success: true;
      data: StoredRouteData;
    }
  | {
      error: string;
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
  const [initialRouteData, setInitialRouteData] =
    useState<StoredRouteData | null>(null);
  const [paidOptionId, setPaidOptionId] = useState<OptionId | null>(null);
  const [unlockedTimeline, setUnlockedTimeline] = useState<
    TimelineStep[] | null
  >(null);
  const [isHydrating, setIsHydrating] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const sessionId = searchParams.get("session_id");
  const optionId = normalizeOptionId(searchParams.get("optionId"));
  const routeIdFromUrl = searchParams.get("routeId");

  useEffect(() => {
    queueMicrotask(() => {
      const hydratePage = async () => {
        setIsHydrating(true);
        setPageError(null);

        try {
          if (sessionId) {
            const verified = await verifyPayment(sessionId);

            if ("error" in verified) {
              throw new Error(verified.error);
            }

            if (verified.paid) {
              if (optionId && optionId !== verified.paidOptionId) {
                console.warn("URL optionId 与 Stripe metadata 不一致，已信任 Stripe metadata。");
              }

              persistRouteLocally(verified.route);
              setStep1State({
                input: verified.route.userInput,
                constraints: verified.route.constraints,
              });
              setInitialRouteData(verified.route);
              setPaidOptionId(verified.paidOptionId);
              setUnlockedTimeline(verified.unlockedTimeline);
              return;
            }
          }

          const anonymousId = getOrCreateAnonymousId();
          const storedRouteId =
            routeIdFromUrl ?? sessionStorage.getItem("step1_route_id");

          if (storedRouteId) {
            const route = await fetchStoredRoute(storedRouteId, anonymousId);

            if (route) {
              persistRouteLocally(route);
              setStep1State({
                input: route.userInput,
                constraints: route.constraints,
              });
              setInitialRouteData(route);
              setPaidOptionId(route.unlockedOptionIds[0] ?? null);
              setUnlockedTimeline(null);
              return;
            }
          }

          const input = sessionStorage.getItem("step1_input");
          const storedConstraints = sessionStorage.getItem("step1_constraints");

          if (!input || !storedConstraints) {
            router.replace("/");
            return;
          }

          setStep1State({
            input,
            constraints: JSON.parse(storedConstraints) as StepConstraints,
          });
          setInitialRouteData(null);
          setPaidOptionId(null);
          setUnlockedTimeline(null);
        } catch (error) {
          console.error("step2 hydrate error:", error);
          setPageError(
            error instanceof Error
              ? error.message
              : "读取路线失败，请稍后重试",
          );
        } finally {
          setIsHydrating(false);
        }
      };

      void hydratePage();
    });
  }, [optionId, routeIdFromUrl, router, sessionId]);

  if (isHydrating) {
    return (
      <LoadingState
        message={sessionId ? "正在验证支付结果..." : "加载中..."}
      />
    );
  }

  if (pageError) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] px-5 text-[#655b52]">
        <div className="w-full max-w-md rounded-lg border border-[#eadfd4] bg-white/85 p-7 text-center shadow-sm">
          <h1 className="text-2xl font-light text-[#29231f]">暂时无法打开路线</h1>
          <p className="mt-3 text-sm leading-6">{pageError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 rounded-lg bg-[#2e4d48] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#243f3b]"
          >
            刷新重试
          </button>
        </div>
      </main>
    );
  }

  if (!step1State) {
    return <LoadingState message="加载中..." />;
  }

  return (
    <Step2Decision
      userInput={step1State.input}
      constraints={step1State.constraints}
      initialRouteData={initialRouteData}
      paidOptionId={paidOptionId}
      unlockedTimeline={unlockedTimeline}
    />
  );
}

async function verifyPayment(sessionId: string): Promise<VerifyPaymentResponse> {
  const response = await fetch(
    `/api/verify-payment?session_id=${encodeURIComponent(sessionId)}`,
  );
  const result = (await response.json()) as VerifyPaymentResponse;

  if (!response.ok) {
    return "error" in result ? result : { error: "支付验证失败，请稍后重试" };
  }

  return result;
}

async function fetchStoredRoute(routeId: string, anonymousId: string) {
  const response = await fetch(
    `/api/generated-route?routeId=${encodeURIComponent(
      routeId,
    )}&anonymousId=${encodeURIComponent(anonymousId)}`,
  );
  const result = (await response.json()) as GeneratedRouteResponse;

  if (!response.ok || "error" in result) {
    return null;
  }

  return result.data;
}

function persistRouteLocally(route: StoredRouteData) {
  sessionStorage.setItem("step1_input", route.userInput);
  sessionStorage.setItem("step1_constraints", JSON.stringify(route.constraints));
  sessionStorage.setItem("step1_route_id", route.routeId);
}

function LoadingState({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] text-[#655b52]">
      {message}
    </main>
  );
}

function normalizeOptionId(value: string | null): OptionId | null {
  return value === "A" || value === "B" ? value : null;
}

function getOrCreateAnonymousId() {
  const storageKey = "state_translator_anonymous_id";
  const existingId = localStorage.getItem(storageKey);

  if (existingId) {
    return existingId;
  }

  const newId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  localStorage.setItem(storageKey, newId);

  return newId;
}
