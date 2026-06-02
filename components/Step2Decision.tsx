"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  moduleLibrary,
  type LifeModule,
  type ModuleCategory,
  type ModuleEnergyLevel,
} from "@/lib/moduleLibrary";
import type {
  GeneratedRouteData,
  OptionId,
  RouteScale,
  StepConstraints,
  TimeScale,
} from "@/lib/routeTypes";

type PlanType = "comfort" | "shift";
type PlanKind = "linear" | "weekend" | "longer";

type SelectedModule = {
  moduleId?: string;
  id?: string;
  name?: string;
  category?: ModuleCategory;
  duration?: number;
  energyLevel?: ModuleEnergyLevel;
  starter?: string;
  sensoryHooks?: string[];
  instructions?: string[];
  tips?: string[];
  customContext?: string;
};

type Anchor = SelectedModule & {
  day: number;
};

type LinearPlan = {
  kind: "linear";
  intro: string;
  type: PlanType;
  modules: SelectedModule[];
  totalDuration: number;
  timeScale: Extract<TimeScale, "1hour" | "tonight">;
};

type WeekendPlan = {
  kind: "weekend";
  intro: string;
  type: PlanType;
  saturdayModules: SelectedModule[];
  sundayModules: SelectedModule[];
  totalDuration: number;
  timeScale: "weekend";
};

type LongerPlan = {
  kind: "longer";
  theme: string;
  type: PlanType;
  anchors: Anchor[];
  timeScale: "longer";
};

type RoutePlan = LinearPlan | WeekendPlan | LongerPlan;

type RoutePlanData = Omit<GeneratedRouteData, "options"> & {
  timeScale: TimeScale;
  options: RoutePlan[];
};

type RenderableModule = Omit<LifeModule, "starter" | "sensoryHooks" | "tips"> & {
  moduleId: string;
  starter: string;
  sensoryHooks: string[];
  tips: string[];
  customContext?: string;
};

type Step2DecisionProps = {
  userInput: string;
  constraints: StepConstraints;
  scale: RouteScale;
  timeScale: TimeScale;
  initialRouteData?: GeneratedRouteData | null;
  paidOptionId?: OptionId | null;
  unlockedTimeline?: unknown;
  forceUnlockAll?: boolean;
};

type GenerateOptionsApiResponse =
  | {
      success: true;
      data: GeneratedRouteData;
    }
  | {
      error: string;
    };

type CreateCheckoutSessionResponse =
  | {
      sessionId: string;
      sessionUrl: string | null;
    }
  | {
      error: string;
    };

type CreateSubscriptionCheckoutResponse =
  | {
      sessionUrl: string | null;
    }
  | {
      error: string;
    };

type UserStatusResponse =
  | {
      isMember: boolean;
      subscriptionStatus: string;
      expiresAt: string | null;
    }
  | {
      error: string;
    };

const moduleById = new Map(
  moduleLibrary.map((lifeModule) => [lifeModule.id, lifeModule]),
);
const moduleIdByName = new Map(
  moduleLibrary.map((lifeModule) => [lifeModule.name, lifeModule.id]),
);

export default function Step2Decision({
  userInput,
  constraints,
  scale,
  timeScale,
  initialRouteData,
  paidOptionId,
  forceUnlockAll = false,
}: Step2DecisionProps) {
  const [data, setData] = useState<GeneratedRouteData | null>(
    initialRouteData ?? null,
  );
  const [isLoading, setIsLoading] = useState(!initialRouteData);
  const [error, setError] = useState<string | null>(null);
  const [activePlanIndex, setActivePlanIndex] = useState(0);
  const [activePaidOptionId, setActivePaidOptionId] = useState<OptionId | null>(
    paidOptionId ?? null,
  );
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const [isMember, setIsMember] = useState(false);
  const [completedModules, setCompletedModules] = useState<Record<string, boolean>>(
    {},
  );
  const [startedModules, setStartedModules] = useState<Record<string, boolean>>(
    {},
  );
  const [expandedTips, setExpandedTips] = useState<Record<string, boolean>>({});
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackOptionId, setFeedbackOptionId] = useState<OptionId | null>(
    null,
  );
  const [feedbackPromptedKey, setFeedbackPromptedKey] = useState<string | null>(
    null,
  );

  const resetLocalPlanState = useCallback(() => {
    setCompletedModules({});
    setStartedModules({});
    setExpandedTips({});
    setFeedbackOpen(false);
    setFeedbackOptionId(null);
    setFeedbackPromptedKey(null);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      const fetchUserStatus = async () => {
        try {
          const anonymousId = getOrCreateAnonymousId();
          const response = await fetch(
            `/api/user-status?anonymous_id=${encodeURIComponent(anonymousId)}`,
          );
          const result = (await response.json()) as UserStatusResponse;

          if (!response.ok || "error" in result) {
            return;
          }

          setIsMember(result.isMember);
        } catch (caughtError) {
          console.error("user status error:", caughtError);
        }
      };

      void fetchUserStatus();
    });
  }, []);

  const generateOptions = useCallback(
    async (regenerate = false) => {
      setIsLoading(true);
      setError(null);
      resetLocalPlanState();

      try {
        if (regenerate) {
          setActivePaidOptionId(null);
        }

        const anonymousId = getOrCreateAnonymousId();
        const response = await fetch("/api/generate-options", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            inputText: userInput,
            anonymousId,
            constraints,
            scale,
            timeScale,
            regenerate,
          }),
        });

        const result = (await response.json()) as GenerateOptionsApiResponse;

        if (!response.ok || "error" in result) {
          throw new Error(
            "error" in result ? result.error : "生成失败，请稍后重试",
          );
        }

        setData(result.data);
        setActivePlanIndex(0);
        sessionStorage.setItem("step1_scale", result.data.scale);
        sessionStorage.setItem("step1_timeScale", result.data.timeScale ?? timeScale);
        sessionStorage.setItem("step1_route_id", result.data.routeId);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "生成失败，请稍后重试";
        setData(null);
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [constraints, resetLocalPlanState, scale, timeScale, userInput],
  );

  useEffect(() => {
    if (initialRouteData) {
      queueMicrotask(() => {
        setData(initialRouteData);
        setIsLoading(false);
      });
      return;
    }

    queueMicrotask(() => {
      void generateOptions();
    });
  }, [generateOptions, initialRouteData]);

  useEffect(() => {
    if (!paidOptionId) {
      return;
    }

    queueMicrotask(() => {
      setActivePaidOptionId(paidOptionId);
      setUnlocked((current) => ({ ...current, [paidOptionId]: true }));
    });
  }, [paidOptionId]);

  const routePlanData = useMemo(() => {
    return data ? toRoutePlanData(data, timeScale) : null;
  }, [data, timeScale]);
  const activePlan = routePlanData?.options[activePlanIndex] ?? null;
  const activeOptionId = activePlan ? getOptionIdForPlan(activePlan) : null;
  const activeLegacyOptionId = activePlan
    ? getLegacyOptionIdForPlan(activePlan)
    : null;
  const isPaid =
    Boolean(forceUnlockAll) ||
    isMember ||
    Boolean(activeOptionId && unlocked[activeOptionId]) ||
    Boolean(activeLegacyOptionId && unlocked[activeLegacyOptionId]) ||
    Boolean(activeOptionId && activePaidOptionId === activeOptionId) ||
    Boolean(activeLegacyOptionId && activePaidOptionId === activeLegacyOptionId) ||
    Boolean(
      activeOptionId &&
        routePlanData?.unlockedOptionIds?.includes(activeOptionId),
    ) ||
    Boolean(
      activeLegacyOptionId &&
        routePlanData?.unlockedOptionIds?.includes(activeLegacyOptionId),
    );
  const renderedModules = useMemo(() => {
    return activePlan ? getPlanModules(activePlan).map(toRenderableModule) : [];
  }, [activePlan]);
  const paidRelevant = activePlan?.kind === "linear" || activePlan?.kind === "weekend";
  const completedCount = renderedModules.filter((module, index) =>
    completedModules[getModuleStateKey(activePlan, module, index)],
  ).length;
  const unlockedModuleCount =
    !paidRelevant || isPaid
      ? renderedModules.length
      : Math.min(1, renderedModules.length);

  useEffect(() => {
    if (!activePlan || !activeOptionId || !paidRelevant || renderedModules.length === 0) {
      return;
    }

    const routeCompletionKey = `${data?.routeId ?? "draft"}:${activeOptionId}`;

    if (
      completedCount === renderedModules.length &&
      feedbackPromptedKey !== routeCompletionKey
    ) {
      queueMicrotask(() => {
        setFeedbackOptionId(activeOptionId);
        setFeedbackPromptedKey(routeCompletionKey);
        setFeedbackOpen(true);
      });
    }
  }, [
    activeOptionId,
    activePlan,
    completedCount,
    data?.routeId,
    feedbackPromptedKey,
    paidRelevant,
    renderedModules.length,
  ]);

  const handleSwitchPlan = () => {
    if (!routePlanData || routePlanData.options.length < 2) {
      return;
    }

    setActivePlanIndex((current) => (current + 1) % routePlanData.options.length);
    resetLocalPlanState();
  };

  const handlePay = async () => {
    try {
      if (!data?.routeId || !activePlan) {
        throw new Error("路线尚未保存，请刷新后重试");
      }

      const amount = activePlan.kind === "weekend" ? 499 : 299;
      const anonymousId = getOrCreateAnonymousId();
      const optionId = getOptionIdForPlan(activePlan);
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          optionId,
          routeId: data.routeId,
          anonymousId,
          planName:
            activePlan.kind === "weekend"
              ? "完整周末安排"
              : `${getPlanLabel(activePlan.type)}完整路线`,
          amount,
        }),
      });

      const result = (await response.json()) as CreateCheckoutSessionResponse;

      if (!response.ok || "error" in result) {
        throw new Error(
          "error" in result ? result.error : "支付初始化失败，请重试",
        );
      }

      if (!result.sessionUrl) {
        throw new Error("支付链接创建失败，请稍后重试");
      }

      window.location.assign(result.sessionUrl);
    } catch (caughtError) {
      console.error("checkout error:", caughtError);
      alert(
        caughtError instanceof Error
          ? caughtError.message
          : "支付初始化失败，请稍后重试",
      );
    }
  };

  const handleSubscribe = async () => {
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
    } catch (caughtError) {
      console.error("subscription checkout error:", caughtError);
      alert(
        caughtError instanceof Error
          ? caughtError.message
          : "会员支付初始化失败，请稍后重试",
      );
    }
  };

  const handleSaveTrip = async () => {
    try {
      if (!data?.routeId || !activePlan) {
        throw new Error("路线尚未保存，请刷新后重试");
      }

      const anonymousId = getOrCreateAnonymousId();
      const response = await fetch("/api/save-trip", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-anonymous-id": anonymousId,
        },
        body: JSON.stringify({
          routeId: data.routeId,
          optionId: getOptionIdForPlan(activePlan),
          anonymousId,
        }),
      });
      const result = (await response.json()) as
        | { success: true }
        | { error: string };

      if (!response.ok || "error" in result) {
        throw new Error(
          "error" in result ? result.error : "保存失败，请稍后重试",
        );
      }

      alert("已保存到我的行程");
    } catch (caughtError) {
      console.error("save trip error:", caughtError);
      alert(
        caughtError instanceof Error
          ? caughtError.message
          : "保存失败，请稍后重试",
      );
    }
  };

  const openFeedback = () => {
    if (!activePlan) {
      return;
    }

    setFeedbackOptionId(getOptionIdForPlan(activePlan));
    setFeedbackOpen(true);
  };

  const handleStarterClick = (module: RenderableModule, index: number) => {
    const stateKey = getModuleStateKey(activePlan, module, index);

    setStartedModules((current) => ({ ...current, [stateKey]: true }));
    localStorage.setItem(`started_module_${stateKey}`, new Date().toISOString());
  };

  const handleCompleteModule = (module: RenderableModule, index: number) => {
    const stateKey = getModuleStateKey(activePlan, module, index);

    setCompletedModules((current) => ({ ...current, [stateKey]: true }));
  };

  const handleFeedbackSubmit = async (rating: string, comment: string) => {
    if (!data?.routeId || !feedbackOptionId) {
      throw new Error("缺少路线或选项信息");
    }

    const anonymousId = getOrCreateAnonymousId();
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        routeId: data.routeId,
        optionId: feedbackOptionId,
        rating,
        comment,
        completion_note: comment,
        anonymousId,
      }),
    });
    const result = (await response.json()) as
      | { success: true }
      | { error: string };

    if (!response.ok || "error" in result) {
      throw new Error("error" in result ? result.error : "提交失败，请稍后重试");
    }
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] px-5">
        <div className="rounded-lg border border-[#eadfd4] bg-white p-7 text-center shadow-sm">
          <p className="text-lg font-light text-[#29231f]">正在安排…</p>
          <p className="mt-3 text-sm text-[#7d746b]">
            我们会按你的时间尺度拼出一份路线。
          </p>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] px-5">
        <div className="w-full max-w-md rounded-lg border border-[#eadfd4] bg-white p-7 text-center shadow-sm">
          <h1 className="text-2xl font-light text-[#29231f]">
            暂时没安排出来
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#6f665d]">
            {error ?? "生成失败，请稍后重试"}
          </p>
          <button
            type="button"
            onClick={() => void generateOptions()}
            className="mt-6 rounded-lg bg-[#2e4d48] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#243f3b]"
          >
            再试一次
          </button>
        </div>
      </main>
    );
  }

  if (!routePlanData || !activePlan) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] px-5">
        <div className="w-full max-w-md rounded-lg border border-[#eadfd4] bg-white p-7 text-center shadow-sm">
          <h1 className="text-2xl font-light text-[#29231f]">
            路线格式需要刷新
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#6f665d]">
            当前页面收到的路线结构不完整，请重新生成一次。
          </p>
          <button
            type="button"
            onClick={() => void generateOptions()}
            className="mt-6 rounded-lg bg-[#2e4d48] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#243f3b]"
          >
            重新生成
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fbfaf7] px-5 pb-32 pt-7 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <PageHeader
          activePlan={activePlan}
          constraints={constraints}
          planCount={routePlanData.options.length}
          scale={routePlanData.scale}
          timeScale={routePlanData.timeScale}
          userInput={userInput}
          onSwitchPlan={handleSwitchPlan}
        />

        <AnimatePresence mode="wait">
          <motion.section
            key={`${activePlan.kind}-${activePlan.type}-${activePlanIndex}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            {activePlan.kind === "weekend" ? (
              <WeekendPlanView
                completedModules={completedModules}
                expandedTips={expandedTips}
                isPaid={isPaid}
                plan={activePlan}
                startedModules={startedModules}
                onCompleteModule={handleCompleteModule}
                onSave={handleSaveTrip}
                onStarterClick={handleStarterClick}
                onToggleTips={(stateKey) =>
                  setExpandedTips((current) => ({
                    ...current,
                    [stateKey]: !current[stateKey],
                  }))
                }
              />
            ) : activePlan.kind === "longer" ? (
              <LongerPlanView
                plan={activePlan}
                onComplete={openFeedback}
                onSubscribe={() => void handleSubscribe()}
              />
            ) : (
              <LinearPlanView
                completedModules={completedModules}
                expandedTips={expandedTips}
                isPaid={isPaid}
                plan={activePlan}
                startedModules={startedModules}
                onCompleteModule={handleCompleteModule}
                onSave={handleSaveTrip}
                onStarterClick={handleStarterClick}
                onToggleTips={(stateKey) =>
                  setExpandedTips((current) => ({
                    ...current,
                    [stateKey]: !current[stateKey],
                  }))
                }
              />
            )}
          </motion.section>
        </AnimatePresence>
      </div>

      {paidRelevant ? (
        <BottomActionBar
          completedCount={completedCount}
          isMember={isMember}
          isPaid={isPaid}
          priceLabel={activePlan.kind === "weekend" ? "$4.99" : "$2.99"}
          totalCount={renderedModules.length}
          unlockLabel={
            activePlan.kind === "weekend" ? "解锁完整周末" : "解锁全部"
          }
          unlockedCount={unlockedModuleCount}
          onComplete={openFeedback}
          onSave={() => void handleSaveTrip()}
          onSubscribe={() => void handleSubscribe()}
          onUnlock={() => void handlePay()}
        />
      ) : null}

      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        onSubmit={handleFeedbackSubmit}
      />
    </main>
  );
}

function PageHeader({
  activePlan,
  constraints,
  planCount,
  scale,
  timeScale,
  userInput,
  onSwitchPlan,
}: {
  activePlan: RoutePlan;
  constraints: StepConstraints;
  planCount: number;
  scale: RouteScale;
  timeScale: TimeScale;
  userInput: string;
  onSwitchPlan: () => void;
}) {
  const title = activePlan.kind === "longer" ? activePlan.theme : activePlan.intro;
  const subline =
    activePlan.kind === "longer"
      ? "主题锚点"
      : `${getPlanLabel(activePlan.type)} · ${getPlanDurationLabel(activePlan)}`;

  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-[#eee5dc] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-sm text-[#8a8178]">
          {userInput || "今晚"} · {constraints.time} · {constraints.budget} ·{" "}
          {getScaleLabel(scale)} · {getTimeScaleLabel(timeScale)}
        </p>
        <h1 className="mt-3 text-3xl font-light leading-tight text-[#29231f] sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-6 text-[#7d746b]">{subline}</p>
      </div>

      {planCount > 1 ? (
        <button
          type="button"
          onClick={onSwitchPlan}
          className="rounded-full border border-[#ded3c8] bg-white px-4 py-2 text-sm font-medium text-[#433b34] shadow-sm transition hover:border-[#d49a43] hover:text-[#9a641c]"
        >
          🔄 换一种安排
        </button>
      ) : null}
    </header>
  );
}

function LinearPlanView({
  completedModules,
  expandedTips,
  isPaid,
  plan,
  startedModules,
  onCompleteModule,
  onSave,
  onStarterClick,
  onToggleTips,
}: {
  completedModules: Record<string, boolean>;
  expandedTips: Record<string, boolean>;
  isPaid: boolean;
  plan: LinearPlan;
  startedModules: Record<string, boolean>;
  onCompleteModule: (module: RenderableModule, index: number) => void;
  onSave: () => void;
  onStarterClick: (module: RenderableModule, index: number) => void;
  onToggleTips: (stateKey: string) => void;
}) {
  return (
    <div className="space-y-4">
      {plan.modules.map((selectedModule, index) => {
        const lifeModule = toRenderableModule(selectedModule);
        const stateKey = getModuleStateKey(plan, lifeModule, index);
        const isFirstModule = index === 0;

        return (
          <ModuleCard
            key={stateKey}
            index={index}
            isCompleted={Boolean(completedModules[stateKey])}
            isFirstModule={isFirstModule}
            isLocked={index > 0 && !isPaid}
            isPaid={isPaid}
            isStarted={Boolean(startedModules[stateKey])}
            module={lifeModule}
            showTips={Boolean(expandedTips[stateKey])}
            onComplete={() => onCompleteModule(lifeModule, index)}
            onSave={isFirstModule ? onSave : undefined}
            onStarterClick={() => onStarterClick(lifeModule, index)}
            onToggleTips={() => onToggleTips(stateKey)}
          />
        );
      })}
    </div>
  );
}

function WeekendPlanView({
  completedModules,
  expandedTips,
  isPaid,
  plan,
  startedModules,
  onCompleteModule,
  onSave,
  onStarterClick,
  onToggleTips,
}: {
  completedModules: Record<string, boolean>;
  expandedTips: Record<string, boolean>;
  isPaid: boolean;
  plan: WeekendPlan;
  startedModules: Record<string, boolean>;
  onCompleteModule: (module: RenderableModule, index: number) => void;
  onSave: () => void;
  onStarterClick: (module: RenderableModule, index: number) => void;
  onToggleTips: (stateKey: string) => void;
}) {
  return (
    <div className="space-y-4">
      <WeekendDayPanel
        defaultOpen
        completedModules={completedModules}
        dayLabel="周六"
        expandedTips={expandedTips}
        globalStartIndex={0}
        isPaid={isPaid}
        modules={plan.saturdayModules}
        plan={plan}
        startedModules={startedModules}
        onCompleteModule={onCompleteModule}
        onSave={onSave}
        onStarterClick={onStarterClick}
        onToggleTips={onToggleTips}
      />
      <WeekendDayPanel
        completedModules={completedModules}
        dayLabel="周日"
        expandedTips={expandedTips}
        globalStartIndex={plan.saturdayModules.length}
        isPaid={isPaid}
        modules={plan.sundayModules}
        plan={plan}
        startedModules={startedModules}
        onCompleteModule={onCompleteModule}
        onSave={onSave}
        onStarterClick={onStarterClick}
        onToggleTips={onToggleTips}
      />
    </div>
  );
}

function WeekendDayPanel({
  completedModules,
  dayLabel,
  defaultOpen = false,
  expandedTips,
  globalStartIndex,
  isPaid,
  modules,
  plan,
  startedModules,
  onCompleteModule,
  onSave,
  onStarterClick,
  onToggleTips,
}: {
  completedModules: Record<string, boolean>;
  dayLabel: string;
  defaultOpen?: boolean;
  expandedTips: Record<string, boolean>;
  globalStartIndex: number;
  isPaid: boolean;
  modules: SelectedModule[];
  plan: WeekendPlan;
  startedModules: Record<string, boolean>;
  onCompleteModule: (module: RenderableModule, index: number) => void;
  onSave: () => void;
  onStarterClick: (module: RenderableModule, index: number) => void;
  onToggleTips: (stateKey: string) => void;
}) {
  const totalDuration = modules.reduce(
    (total, selectedModule) => total + toRenderableModule(selectedModule).duration,
    0,
  );

  return (
    <details
      open={defaultOpen}
      className="group rounded-lg border border-[#e8ded2] bg-white shadow-sm"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 text-[#29231f] marker:hidden">
        <div>
          <p className="text-lg font-medium">{dayLabel}</p>
          <p className="mt-1 text-sm text-[#8a8178]">
            {modules.length} 个模块 · {totalDuration} 分钟
          </p>
        </div>
        <span className="text-sm text-[#9a9188] transition group-open:rotate-180">
          ↓
        </span>
      </summary>
      <div className="space-y-4 border-t border-[#f0e7dd] p-5">
        {modules.map((selectedModule, localIndex) => {
          const globalIndex = globalStartIndex + localIndex;
          const lifeModule = toRenderableModule(selectedModule);
          const stateKey = getModuleStateKey(plan, lifeModule, globalIndex);
          const isFirstModule = globalIndex === 0;

          return (
            <ModuleCard
              key={stateKey}
              index={globalIndex}
              isCompleted={Boolean(completedModules[stateKey])}
              isFirstModule={isFirstModule}
              isLocked={globalIndex > 0 && !isPaid}
              isPaid={isPaid}
              isStarted={Boolean(startedModules[stateKey])}
              module={lifeModule}
              showTips={Boolean(expandedTips[stateKey])}
              onComplete={() => onCompleteModule(lifeModule, globalIndex)}
              onSave={isFirstModule ? onSave : undefined}
              onStarterClick={() => onStarterClick(lifeModule, globalIndex)}
              onToggleTips={() => onToggleTips(stateKey)}
            />
          );
        })}
      </div>
    </details>
  );
}

function LongerPlanView({
  plan,
  onComplete,
  onSubscribe,
}: {
  plan: LongerPlan;
  onComplete: () => void;
  onSubscribe: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[#e8ded2] bg-white p-6 shadow-sm">
        <p className="text-sm text-[#8a8178]">生活主题</p>
        <h2 className="mt-2 text-3xl font-light text-[#29231f]">
          {plan.theme}
        </h2>
      </div>

      <div className="space-y-3">
        {plan.anchors.map((anchor, index) => {
          const lifeModule = toRenderableModule(anchor);

          return (
            <div
              key={`${anchor.day}-${lifeModule.moduleId}-${index}`}
              className="rounded-lg border border-[#e8ded2] bg-white p-5 shadow-sm"
            >
              <p className="text-sm font-medium text-[#9a641c]">
                第 {anchor.day} 天
              </p>
              <div className="mt-2 flex items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-medium text-[#29231f]">
                    {lifeModule.name}
                  </p>
                  {anchor.customContext ? (
                    <p className="mt-2 text-sm leading-6 text-[#655b52]">
                      {anchor.customContext}
                    </p>
                  ) : null}
                </div>
                <span className="shrink-0 rounded-full bg-[#f5efe8] px-3 py-1 text-xs text-[#655b52]">
                  {lifeModule.duration} min
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onComplete}
          className="rounded-lg border border-[#2e4d48] px-4 py-3 text-sm font-medium text-[#2e4d48] transition hover:bg-[#e2eee9]"
        >
          我完成了
        </button>
        <button
          type="button"
          onClick={onSubscribe}
          className="rounded-lg bg-[#d9952f] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#bd7d1f]"
        >
          升级会员解锁更多主题
        </button>
      </div>
    </div>
  );
}

function ModuleCard({
  index,
  isCompleted,
  isFirstModule,
  isLocked,
  isPaid,
  isStarted,
  module,
  showTips,
  onComplete,
  onSave,
  onStarterClick,
  onToggleTips,
}: {
  index: number;
  isCompleted: boolean;
  isFirstModule: boolean;
  isLocked: boolean;
  isPaid: boolean;
  isStarted: boolean;
  module: RenderableModule;
  showTips: boolean;
  onComplete: () => void;
  onSave?: () => void;
  onStarterClick: () => void;
  onToggleTips: () => void;
}) {
  const visibleInstructions = isPaid
    ? module.instructions
    : isFirstModule
      ? module.instructions.slice(0, 2)
      : [];
  const hasTips = isPaid && module.tips.length > 0;

  return (
    <motion.article
      layout
      className="overflow-hidden rounded-lg border border-[#e8ded2] bg-white shadow-sm"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-medium text-[#29231f]">
                {module.name}
              </h2>
              <CategoryPill category={module.category} />
            </div>
            <p className="mt-1 text-sm text-[#8a8178]">
              第 {index + 1} 个模块 · {module.duration} 分钟
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-[#f5efe8] px-3 py-1 text-xs text-[#655b52]">
            {module.duration} min
          </span>
        </div>

        {module.customContext ? (
          <p className="mt-4 rounded-lg bg-[#fbf4ec] px-4 py-3 text-sm leading-6 text-[#805743]">
            {module.customContext}
          </p>
        ) : null}

        <div className="mt-5 rounded-lg bg-[#fff3db] p-4">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[#9a641c]">
            starter
          </p>
          <p className="mt-2 text-base leading-7 text-[#433b34]">
            {module.starter}
          </p>
          <button
            type="button"
            onClick={onStarterClick}
            className="mt-3 rounded-full bg-[#d9952f] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#bd7d1f]"
          >
            {isStarted ? "已开始" : "👉 现在开始"}
          </button>
        </div>

        {module.sensoryHooks.length > 0 ? (
          <div className="mt-4 space-y-2">
            {module.sensoryHooks.slice(0, 2).map((hook) => (
              <p
                key={hook}
                className="text-sm italic leading-6 text-[#9a9188]"
              >
                {hook}
              </p>
            ))}
          </div>
        ) : null}

        {visibleInstructions.length > 0 ? (
          <ol className="mt-5 space-y-2">
            {visibleInstructions.map((instruction, instructionIndex) => (
              <li
                key={`${instruction}-${instructionIndex}`}
                className="flex gap-3 text-sm leading-6 text-[#655b52]"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e2eee9] text-xs text-[#2e4d48]">
                  {instructionIndex + 1}
                </span>
                <span>{instruction}</span>
              </li>
            ))}
          </ol>
        ) : null}

        {isLocked ? (
          <div className="relative mt-5 overflow-hidden rounded-lg border border-[#eadfd4] bg-[#fffdfa] p-4">
            <div className="space-y-2 blur-sm opacity-50">
              <div className="h-3 w-11/12 rounded-full bg-[#ded3c8]" />
              <div className="h-3 w-8/12 rounded-full bg-[#ded3c8]" />
              <div className="h-3 w-10/12 rounded-full bg-[#ded3c8]" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm">
              <div className="text-center">
                <p className="text-2xl" aria-hidden="true">
                  🔒
                </p>
                <p className="mt-2 text-sm font-medium text-[#433b34]">
                  解锁后可见剩余步骤
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {hasTips ? (
          <div className="mt-5">
            <button
              type="button"
              onClick={onToggleTips}
              className="rounded-full border border-[#ded3c8] px-4 py-2 text-sm text-[#655b52] transition hover:border-[#9b6b55] hover:text-[#805743]"
            >
              📘 更多技巧
            </button>
            <AnimatePresence initial={false}>
              {showTips ? (
                <motion.ul
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="mt-3 space-y-2 overflow-hidden"
                >
                  {module.tips.map((tip) => (
                    <li
                      key={tip}
                      className="rounded-lg bg-[#fbfaf7] px-4 py-3 text-sm leading-6 text-[#655b52]"
                    >
                      {tip}
                    </li>
                  ))}
                </motion.ul>
              ) : null}
            </AnimatePresence>
          </div>
        ) : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={isLocked || isCompleted}
            onClick={onComplete}
            className="flex-1 rounded-lg border border-[#ded3c8] px-4 py-3 text-sm font-medium text-[#655b52] transition hover:border-[#2e4d48] hover:text-[#2e4d48] disabled:cursor-not-allowed disabled:opacity-55"
          >
            {isCompleted ? "✓ 已完成" : isLocked ? "解锁后可标记" : "✓ 标记完成"}
          </button>
          {onSave ? (
            <button
              type="button"
              onClick={() => void onSave()}
              className="flex-1 rounded-lg bg-[#2e4d48] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#243f3b]"
            >
              💾 保存本次路线
            </button>
          ) : null}
        </div>
      </div>
    </motion.article>
  );
}

function BottomActionBar({
  completedCount,
  isMember,
  isPaid,
  priceLabel,
  totalCount,
  unlockLabel,
  unlockedCount,
  onComplete,
  onSave,
  onSubscribe,
  onUnlock,
}: {
  completedCount: number;
  isMember: boolean;
  isPaid: boolean;
  priceLabel: string;
  totalCount: number;
  unlockLabel: string;
  unlockedCount: number;
  onComplete: () => void;
  onSave: () => void;
  onSubscribe: () => void;
  onUnlock: () => void;
}) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#eadfd4] bg-[#fffdfa]/95 px-5 py-3 shadow-[0_-8px_24px_rgba(41,35,31,0.08)] backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-[#433b34]">
            已解锁 {unlockedCount}/{totalCount} 模块
          </p>
          <p className="mt-1 text-xs text-[#8a8178]">
            已标记完成 {completedCount}/{totalCount}
            {isMember ? " · 会员已生效" : ""}
          </p>
        </div>

        {isPaid ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onSave}
              className="rounded-lg border border-[#2e4d48] px-5 py-3 text-sm font-medium text-[#2e4d48] transition hover:bg-[#e2eee9]"
            >
              保存到我的行程
            </button>
            <button
              type="button"
              onClick={onComplete}
              className="rounded-lg bg-[#2e4d48] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#243f3b]"
            >
              我完成了
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onUnlock}
              className="rounded-lg bg-[#d9952f] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#bd7d1f]"
            >
              🔓 {unlockLabel} ({priceLabel})
            </button>
            <button
              type="button"
              onClick={onSubscribe}
              className="rounded-lg border border-[#d9952f] bg-white px-5 py-3 text-sm font-medium text-[#9a641c] transition hover:bg-[#fff3db]"
            >
              会员 $7.99/月
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryPill({ category }: { category: ModuleCategory }) {
  const labelMap: Record<ModuleCategory, string> = {
    food: "food",
    movement: "move",
    space: "space",
    mind: "mind",
  };
  const colorMap: Record<ModuleCategory, string> = {
    food: "bg-[#d9952f]",
    movement: "bg-[#5f8f83]",
    space: "bg-[#9b6b55]",
    mind: "bg-[#7b7f9c]",
  };

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#f5efe8] px-2 py-1 text-xs text-[#655b52]">
      <span className={`h-1.5 w-1.5 rounded-full ${colorMap[category]}`} />
      {labelMap[category]}
    </span>
  );
}

function FeedbackModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (rating: string, comment: string) => Promise<void>;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [rating, setRating] = useState("有用");
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);

    try {
      await onSubmit(rating, comment);
      setSubmitted(true);
      setComment("");
      window.setTimeout(() => {
        setSubmitted(false);
        onClose();
      }, 1000);
    } catch (error) {
      console.error("feedback submit error:", error);
      alert(error instanceof Error ? error.message : "提交失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#29231f]/30 px-5 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ y: 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 18, opacity: 0 }}
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
          >
            {submitted ? (
              <div className="py-6 text-center">
                <p className="text-xl font-light leading-8 text-[#29231f]">
                  谢谢反馈，已经记下来了。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSubmitted(false);
                    onClose();
                  }}
                  className="mt-6 rounded-lg bg-[#2e4d48] px-5 py-3 text-sm font-medium text-white"
                >
                  收好
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-2xl font-light text-[#29231f]">
                  这条路线对你有用吗？
                </h3>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {["有用", "一般", "不太适合"].map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setRating(label)}
                      className={`rounded-lg border px-3 py-3 text-sm transition ${
                        rating === label
                          ? "border-[#2e4d48] bg-[#e2eee9] text-[#203b37]"
                          : "border-[#eadfd4] bg-[#fbfaf7] text-[#655b52] hover:border-[#2e4d48]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  placeholder="后来发生什么了吗？"
                  className="mt-4 min-h-28 w-full resize-none rounded-lg border border-[#eadfd4] bg-[#fffdfa] p-4 text-sm outline-none focus:border-[#2e4d48]"
                />
                <div className="mt-5 flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-lg border border-[#ded3c8] px-4 py-3 text-sm text-[#655b52]"
                  >
                    稍后再说
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => void handleSubmit()}
                    className="flex-1 rounded-lg bg-[#2e4d48] px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? "提交中..." : "提交并关闭"}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function toRoutePlanData(
  data: GeneratedRouteData,
  fallbackTimeScale: TimeScale,
): RoutePlanData | null {
  const options = data.options as unknown;
  const effectiveTimeScale = normalizeTimeScale(data.timeScale ?? fallbackTimeScale);

  if (!Array.isArray(options)) {
    return null;
  }

  const plans = options
    .map((option, index) =>
      normalizeRoutePlan(
        option,
        effectiveTimeScale,
        index === 0 ? "comfort" : "shift",
      ),
    )
    .filter((plan): plan is RoutePlan => plan !== null);

  if (plans.length === 0) {
    return null;
  }

  return {
    ...data,
    timeScale: effectiveTimeScale,
    options: plans,
    unlockedOptionIds: data.unlockedOptionIds ?? [],
  };
}

function normalizeRoutePlan(
  value: unknown,
  timeScale: TimeScale,
  fallbackType: PlanType,
): RoutePlan | null {
  if (!isRecord(value)) {
    return null;
  }

  const kind = normalizePlanKind(value.kind, timeScale, value);

  if (kind === "weekend") {
    return normalizeWeekendPlan(value, fallbackType);
  }

  if (kind === "longer") {
    return normalizeLongerPlan(value, fallbackType);
  }

  return normalizeLinearPlan(value, fallbackType, timeScale);
}

function normalizeLinearPlan(
  value: Record<string, unknown>,
  fallbackType: PlanType,
  timeScale: TimeScale,
): LinearPlan | null {
  const rawModules = Array.isArray(value.modules) ? value.modules : [];
  const modules = rawModules
    .map(normalizeSelectedModule)
    .filter((module): module is SelectedModule => module !== null);

  if (modules.length === 0) {
    return null;
  }

  return {
    kind: "linear",
    intro:
      typeof value.intro === "string" && value.intro.trim()
        ? value.intro.trim()
        : "先从一步开始",
    type: normalizePlanType(value.type, fallbackType),
    modules,
    totalDuration:
      typeof value.totalDuration === "number"
        ? value.totalDuration
        : sumSelectedModuleDurations(modules),
    timeScale: timeScale === "1hour" ? "1hour" : "tonight",
  };
}

function normalizeWeekendPlan(
  value: Record<string, unknown>,
  fallbackType: PlanType,
): WeekendPlan | null {
  const saturdayModules = Array.isArray(value.saturdayModules)
    ? value.saturdayModules
        .map(normalizeSelectedModule)
        .filter((module): module is SelectedModule => module !== null)
    : [];
  const sundayModules = Array.isArray(value.sundayModules)
    ? value.sundayModules
        .map(normalizeSelectedModule)
        .filter((module): module is SelectedModule => module !== null)
    : [];

  if (saturdayModules.length === 0 || sundayModules.length === 0) {
    return null;
  }

  return {
    kind: "weekend",
    intro:
      typeof value.intro === "string" && value.intro.trim()
        ? value.intro.trim()
        : "周末慢慢展开",
    type: normalizePlanType(value.type, fallbackType),
    saturdayModules,
    sundayModules,
    totalDuration:
      typeof value.totalDuration === "number"
        ? value.totalDuration
        : sumSelectedModuleDurations([...saturdayModules, ...sundayModules]),
    timeScale: "weekend",
  };
}

function normalizeLongerPlan(
  value: Record<string, unknown>,
  fallbackType: PlanType,
): LongerPlan | null {
  const anchors = Array.isArray(value.anchors)
    ? value.anchors
        .map(normalizeAnchor)
        .filter((anchor): anchor is Anchor => anchor !== null)
    : [];

  if (anchors.length === 0) {
    return null;
  }

  return {
    kind: "longer",
    theme:
      typeof value.theme === "string" && value.theme.trim()
        ? value.theme.trim()
        : "恢复精力周",
    type: normalizePlanType(value.type, fallbackType),
    anchors,
    timeScale: "longer",
  };
}

function normalizeSelectedModule(value: unknown): SelectedModule | null {
  if (typeof value === "string") {
    return { moduleId: value };
  }

  if (!isRecord(value)) {
    return null;
  }

  const selected: SelectedModule = {};

  if (typeof value.moduleId === "string") {
    selected.moduleId = value.moduleId;
  }

  if (typeof value.id === "string") {
    selected.id = value.id;
  }

  if (typeof value.name === "string") {
    selected.name = value.name;
  }

  if (isModuleCategory(value.category)) {
    selected.category = value.category;
  }

  if (typeof value.duration === "number") {
    selected.duration = value.duration;
  }

  if (isModuleEnergyLevel(value.energyLevel)) {
    selected.energyLevel = value.energyLevel;
  }

  if (typeof value.starter === "string") {
    selected.starter = value.starter;
  }

  if (Array.isArray(value.sensoryHooks)) {
    selected.sensoryHooks = value.sensoryHooks.filter(
      (hook): hook is string => typeof hook === "string",
    );
  }

  if (Array.isArray(value.instructions)) {
    selected.instructions = value.instructions.filter(
      (instruction): instruction is string => typeof instruction === "string",
    );
  }

  if (Array.isArray(value.tips)) {
    selected.tips = value.tips.filter((tip): tip is string => typeof tip === "string");
  }

  if (typeof value.customContext === "string") {
    selected.customContext = value.customContext;
  }

  return selected.moduleId || selected.id || selected.name ? selected : null;
}

function normalizeAnchor(value: unknown): Anchor | null {
  const selectedModule = normalizeSelectedModule(value);

  if (!selectedModule || !isRecord(value)) {
    return null;
  }

  return {
    ...selectedModule,
    day:
      typeof value.day === "number" && Number.isFinite(value.day)
        ? Math.max(1, Math.round(value.day))
        : 1,
  };
}

function toRenderableModule(selectedModule: SelectedModule): RenderableModule {
  const moduleId = resolveModuleId(selectedModule);
  const baseModule = moduleId ? moduleById.get(moduleId) : undefined;
  const instructions =
    selectedModule.instructions?.filter(Boolean) ??
    baseModule?.instructions ??
    ["先做一个不需要准备的动作。"];
  const name = selectedModule.name ?? baseModule?.name ?? "自定义模块";
  const category = selectedModule.category ?? baseModule?.category ?? "mind";
  const duration = selectedModule.duration ?? baseModule?.duration ?? 15;
  const energyLevel =
    selectedModule.energyLevel ?? baseModule?.energyLevel ?? "low";
  const starter =
    selectedModule.starter?.trim() ||
    baseModule?.starter?.trim() ||
    instructions[0] ||
    "把这件事缩小到现在能做的一步。";
  const sensoryHooks =
    selectedModule.sensoryHooks?.filter(Boolean).slice(0, 2) ??
    baseModule?.sensoryHooks?.filter(Boolean).slice(0, 2) ??
    buildSensoryHooks(name, category);
  const tips =
    selectedModule.tips?.filter(Boolean) ??
    baseModule?.tips?.filter(Boolean) ??
    buildDefaultTips(name);

  return {
    id: moduleId ?? selectedModule.id ?? selectedModule.moduleId ?? name,
    moduleId: moduleId ?? selectedModule.id ?? selectedModule.moduleId ?? name,
    name,
    category,
    duration,
    energyLevel,
    starter,
    sensoryHooks,
    instructions,
    tips,
    customContext: selectedModule.customContext,
  };
}

function getPlanModules(plan: RoutePlan): SelectedModule[] {
  if (plan.kind === "weekend") {
    return [...plan.saturdayModules, ...plan.sundayModules];
  }

  if (plan.kind === "longer") {
    return plan.anchors;
  }

  return plan.modules;
}

function resolveModuleId(selectedModule: SelectedModule) {
  const rawId = selectedModule.moduleId ?? selectedModule.id;

  if (rawId && moduleById.has(rawId)) {
    return rawId;
  }

  if (selectedModule.name) {
    return moduleIdByName.get(selectedModule.name) ?? null;
  }

  return null;
}

function sumSelectedModuleDurations(modules: SelectedModule[]) {
  return modules.reduce(
    (total, selectedModule) => total + toRenderableModule(selectedModule).duration,
    0,
  );
}

function buildSensoryHooks(name: string, category: ModuleCategory) {
  const categoryHook: Record<ModuleCategory, string> = {
    food: "留意热气、碗边和第一口的温度。",
    movement: "注意脚底踩到地面的节奏，不用走快。",
    space: "让手边先出现一个干净的小平面。",
    mind: "把注意力放在纸面、呼吸或一句短句上。",
  };

  return [`${name} 不需要做得漂亮，只要开始。`, categoryHook[category]];
}

function buildDefaultTips(name: string) {
  return [
    `如果中途卡住，把「${name}」缩短到 5 分钟。`,
    "不要同时打开新的娱乐内容，先完成眼前这一步。",
  ];
}

function getModuleStateKey(
  plan: RoutePlan | null,
  module: RenderableModule,
  index: number,
) {
  return `${plan?.kind ?? "plan"}:${plan?.type ?? "comfort"}:${module.moduleId}:${index}`;
}

function getOptionIdForPlan(plan: RoutePlan): OptionId {
  return plan.type;
}

function getLegacyOptionIdForPlan(plan: RoutePlan): OptionId {
  return plan.type === "comfort" ? "A" : "B";
}

function getPlanLabel(type: PlanType) {
  return type === "comfort" ? "顺着此刻" : "轻轻掰一下";
}

function getPlanDurationLabel(plan: RoutePlan) {
  if (plan.kind === "longer") {
    return `${plan.anchors.length} 个锚点`;
  }

  return `${plan.totalDuration} 分钟`;
}

function getScaleLabel(currentScale: RouteScale) {
  const labels: Record<RouteScale, string> = {
    auto: "今晚",
    tonight: "今晚",
    weekend: "周末",
    travel: "旅行",
    meal: "一顿饭",
    book: "一本书",
    corner: "一个角落",
  };

  return labels[currentScale];
}

function getTimeScaleLabel(currentTimeScale: TimeScale) {
  const labels: Record<TimeScale, string> = {
    "1hour": "1小时",
    tonight: "今晚",
    weekend: "周末",
    longer: "更长",
  };

  return labels[currentTimeScale];
}

function normalizePlanKind(
  value: unknown,
  timeScale: TimeScale,
  record: Record<string, unknown>,
): PlanKind {
  if (value === "linear" || value === "weekend" || value === "longer") {
    return value;
  }

  if (Array.isArray(record.saturdayModules) || Array.isArray(record.sundayModules)) {
    return "weekend";
  }

  if (Array.isArray(record.anchors) || typeof record.theme === "string") {
    return "longer";
  }

  if (timeScale === "weekend") {
    return "weekend";
  }

  if (timeScale === "longer") {
    return "longer";
  }

  return "linear";
}

function normalizePlanType(value: unknown, fallbackType: PlanType): PlanType {
  return value === "comfort" || value === "shift" ? value : fallbackType;
}

function normalizeTimeScale(value: unknown): TimeScale {
  if (
    value === "1hour" ||
    value === "tonight" ||
    value === "weekend" ||
    value === "longer"
  ) {
    return value;
  }

  return "tonight";
}

function isModuleCategory(value: unknown): value is ModuleCategory {
  return (
    value === "food" ||
    value === "movement" ||
    value === "space" ||
    value === "mind"
  );
}

function isModuleEnergyLevel(value: unknown): value is ModuleEnergyLevel {
  return value === "low" || value === "mid" || value === "high";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getOrCreateAnonymousId() {
  const storageKey = "anonymous_id";
  const legacyStorageKey = "state_translator_anonymous_id";
  const existingId =
    sessionStorage.getItem(storageKey) ??
    localStorage.getItem(storageKey) ??
    localStorage.getItem(legacyStorageKey);

  if (existingId) {
    localStorage.setItem(storageKey, existingId);
    sessionStorage.setItem(storageKey, existingId);
    return existingId;
  }

  const newId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `anon_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  localStorage.setItem(storageKey, newId);
  localStorage.setItem(legacyStorageKey, newId);
  sessionStorage.setItem(storageKey, newId);

  return newId;
}
