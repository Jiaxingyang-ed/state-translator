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
} from "@/lib/routeTypes";

type ModuleRouteType = "comfort" | "shift";

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

type ModuleRoute = {
  intro: string;
  modules: SelectedModule[];
  transitions: string[];
  totalDuration: number;
  type: ModuleRouteType;
};

type ModuleRouteData = Omit<GeneratedRouteData, "options"> & {
  options: ModuleRoute[];
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
  initialRouteData,
  paidOptionId,
  forceUnlockAll = false,
}: Step2DecisionProps) {
  const [data, setData] = useState<GeneratedRouteData | null>(
    initialRouteData ?? null,
  );
  const [isLoading, setIsLoading] = useState(!initialRouteData);
  const [error, setError] = useState<string | null>(null);
  const [activeRouteIndex, setActiveRouteIndex] = useState(0);
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

  const resetLocalRouteState = useCallback(() => {
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
      resetLocalRouteState();

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
        setActiveRouteIndex(0);
        sessionStorage.setItem("step1_scale", result.data.scale);
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
    [constraints, resetLocalRouteState, scale, userInput],
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

  const moduleRouteData = useMemo(() => {
    return data ? toModuleRouteData(data) : null;
  }, [data]);

  const activeRoute = moduleRouteData?.options[activeRouteIndex] ?? null;
  const activeOptionId = activeRoute ? getOptionIdForRoute(activeRoute) : null;
  const activeLegacyOptionId = activeRoute
    ? getLegacyOptionIdForRoute(activeRoute)
    : null;
  const isRouteUnlocked =
    Boolean(forceUnlockAll) ||
    isMember ||
    Boolean(activeOptionId && unlocked[activeOptionId]) ||
    Boolean(activeLegacyOptionId && unlocked[activeLegacyOptionId]) ||
    Boolean(activeOptionId && activePaidOptionId === activeOptionId) ||
    Boolean(activeLegacyOptionId && activePaidOptionId === activeLegacyOptionId) ||
    Boolean(
      activeOptionId &&
        moduleRouteData?.unlockedOptionIds?.includes(activeOptionId),
    ) ||
    Boolean(
      activeLegacyOptionId &&
        moduleRouteData?.unlockedOptionIds?.includes(activeLegacyOptionId),
    );

  const renderableModules = useMemo(() => {
    return activeRoute?.modules.map(toRenderableModule) ?? [];
  }, [activeRoute]);
  const completedCount = renderableModules.filter((module, index) =>
    completedModules[getModuleStateKey(activeRoute, module, index)],
  ).length;
  const unlockedModuleCount = isRouteUnlocked
    ? renderableModules.length
    : Math.min(1, renderableModules.length);

  useEffect(() => {
    if (!activeRoute || !activeOptionId || renderableModules.length === 0) {
      return;
    }

    const routeCompletionKey = `${data?.routeId ?? "draft"}:${activeOptionId}`;

    if (
      completedCount === renderableModules.length &&
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
    activeRoute,
    completedCount,
    data?.routeId,
    feedbackPromptedKey,
    renderableModules.length,
  ]);

  const handleSwitchRoute = () => {
    if (!moduleRouteData || moduleRouteData.options.length < 2) {
      return;
    }

    setActiveRouteIndex((current) => (current + 1) % moduleRouteData.options.length);
    resetLocalRouteState();
  };

  const handlePay = async () => {
    try {
      if (!data?.routeId || !activeRoute) {
        throw new Error("路线尚未保存，请刷新后重试");
      }

      const anonymousId = getOrCreateAnonymousId();
      const optionId = getOptionIdForRoute(activeRoute);
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          optionId,
          routeId: data.routeId,
          anonymousId,
          planName: `${getRouteLabel(activeRoute.type)}完整路线`,
          amount: 299,
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
      if (!data?.routeId || !activeRoute) {
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
          optionId: getOptionIdForRoute(activeRoute),
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

  const handleStarterClick = (module: RenderableModule, index: number) => {
    const stateKey = getModuleStateKey(activeRoute, module, index);

    setStartedModules((current) => ({ ...current, [stateKey]: true }));
    localStorage.setItem(`started_module_${stateKey}`, new Date().toISOString());
  };

  const handleCompleteModule = (module: RenderableModule, index: number) => {
    const stateKey = getModuleStateKey(activeRoute, module, index);

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
          <p className="text-lg font-light text-[#29231f]">正在安排今晚…</p>
          <p className="mt-3 text-sm text-[#7d746b]">
            我们会从几个小模块里拼出一条可开始的路线。
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

  if (!moduleRouteData || !activeRoute) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] px-5">
        <div className="w-full max-w-md rounded-lg border border-[#eadfd4] bg-white p-7 text-center shadow-sm">
          <h1 className="text-2xl font-light text-[#29231f]">
            路线格式需要刷新
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#6f665d]">
            当前页面收到的不是模块化路线，请重新生成一次。
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
        <header className="mb-6 flex flex-col gap-4 border-b border-[#eee5dc] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-[#8a8178]">
              {userInput || "今晚"} · {constraints.time} · {constraints.budget} ·{" "}
              {getScaleLabel(moduleRouteData.scale)}
            </p>
            <h1 className="mt-3 text-3xl font-light leading-tight text-[#29231f] sm:text-4xl">
              {activeRoute.intro || moduleRouteData.translation}
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#7d746b]">
              {getRouteLabel(activeRoute.type)} · {activeRoute.totalDuration} 分钟
            </p>
          </div>

          {moduleRouteData.options.length > 1 ? (
            <button
              type="button"
              onClick={handleSwitchRoute}
              className="rounded-full border border-[#ded3c8] bg-white px-4 py-2 text-sm font-medium text-[#433b34] shadow-sm transition hover:border-[#d49a43] hover:text-[#9a641c]"
            >
              🔄 换一种安排
            </button>
          ) : null}
        </header>

        <AnimatePresence mode="wait">
          <motion.section
            key={activeRoute.type}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="space-y-4"
          >
            {renderableModules.map((module, index) => {
              const stateKey = getModuleStateKey(activeRoute, module, index);
              const isFirstModule = index === 0;
              const isLocked = index > 0 && !isRouteUnlocked;
              const isCompleted = Boolean(completedModules[stateKey]);
              const isStarted = Boolean(startedModules[stateKey]);
              const showTips = Boolean(expandedTips[stateKey]);
              const transition = activeRoute.transitions[index];

              return (
                <div key={stateKey}>
                  <ModuleCard
                    module={module}
                    index={index}
                    isFirstModule={isFirstModule}
                    isLocked={isLocked}
                    isPaid={isRouteUnlocked}
                    isCompleted={isCompleted}
                    isStarted={isStarted}
                    showTips={showTips}
                    onStarterClick={() => handleStarterClick(module, index)}
                    onComplete={() => handleCompleteModule(module, index)}
                    onToggleTips={() =>
                      setExpandedTips((current) => ({
                        ...current,
                        [stateKey]: !current[stateKey],
                      }))
                    }
                    onSave={isFirstModule ? handleSaveTrip : undefined}
                  />
                  {transition ? <RouteTransition text={transition} /> : null}
                </div>
              );
            })}
          </motion.section>
        </AnimatePresence>
      </div>

      <BottomUnlockBar
        completedCount={completedCount}
        isMember={isMember}
        isUnlocked={isRouteUnlocked}
        totalCount={renderableModules.length}
        unlockedCount={unlockedModuleCount}
        onUnlock={() => void handlePay()}
        onSubscribe={() => void handleSubscribe()}
      />

      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        onSubmit={handleFeedbackSubmit}
      />
    </main>
  );
}

function ModuleCard({
  module,
  index,
  isFirstModule,
  isLocked,
  isPaid,
  isCompleted,
  isStarted,
  showTips,
  onStarterClick,
  onComplete,
  onToggleTips,
  onSave,
}: {
  module: RenderableModule;
  index: number;
  isFirstModule: boolean;
  isLocked: boolean;
  isPaid: boolean;
  isCompleted: boolean;
  isStarted: boolean;
  showTips: boolean;
  onStarterClick: () => void;
  onComplete: () => void;
  onToggleTips: () => void;
  onSave?: () => void;
}) {
  const visibleInstructions = isPaid
    ? module.instructions
    : isFirstModule
      ? module.instructions.slice(0, 2)
      : [];
  const hasTips = isPaid && module.tips && module.tips.length > 0;

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
                  {module.tips?.map((tip) => (
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

function BottomUnlockBar({
  completedCount,
  isMember,
  isUnlocked,
  totalCount,
  unlockedCount,
  onUnlock,
  onSubscribe,
}: {
  completedCount: number;
  isMember: boolean;
  isUnlocked: boolean;
  totalCount: number;
  unlockedCount: number;
  onUnlock: () => void;
  onSubscribe: () => void;
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

        {isUnlocked ? (
          <button
            type="button"
            disabled
            className="rounded-lg bg-[#e2eee9] px-5 py-3 text-sm font-medium text-[#2e4d48]"
          >
            已解锁全部
          </button>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={onUnlock}
              className="rounded-lg bg-[#d9952f] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#bd7d1f]"
            >
              🔓 解锁全部 ($2.99)
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

function RouteTransition({ text }: { text: string }) {
  return (
    <div className="py-3 text-center">
      <p className="text-lg leading-none text-[#c0aa94]">↓</p>
      <p className="mt-2 text-sm italic leading-6 text-[#8a8178]">{text}</p>
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

function toModuleRouteData(data: GeneratedRouteData): ModuleRouteData | null {
  const options = data.options as unknown;

  if (!Array.isArray(options)) {
    return null;
  }

  const routes = options
    .map((option, index) =>
      normalizeModuleRoute(option, index === 0 ? "comfort" : "shift"),
    )
    .filter((route): route is ModuleRoute => route !== null);

  if (routes.length === 0) {
    return null;
  }

  return {
    ...data,
    options: routes,
    unlockedOptionIds: data.unlockedOptionIds ?? [],
  };
}

function normalizeModuleRoute(
  value: unknown,
  fallbackType: ModuleRouteType,
): ModuleRoute | null {
  if (!isRecord(value)) {
    return null;
  }

  const modules = Array.isArray(value.modules)
    ? value.modules
        .map(normalizeSelectedModule)
        .filter((module): module is SelectedModule => module !== null)
    : [];

  if (modules.length === 0) {
    return null;
  }

  const routeType =
    value.type === "comfort" || value.type === "shift"
      ? value.type
      : fallbackType;
  const transitions = Array.isArray(value.transitions)
    ? value.transitions
        .filter((transition): transition is string => typeof transition === "string")
        .map((transition) => transition.trim())
        .filter(Boolean)
    : [];
  const totalDuration =
    typeof value.totalDuration === "number"
      ? value.totalDuration
      : modules.reduce((total, module) => {
          const renderableModule = toRenderableModule(module);

          return total + renderableModule.duration;
        }, 0);

  return {
    intro: typeof value.intro === "string" ? value.intro : "先从一个动作开始",
    modules,
    transitions,
    totalDuration,
    type: routeType,
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
  route: ModuleRoute | null,
  module: RenderableModule,
  index: number,
) {
  return `${route?.type ?? "route"}:${module.moduleId}:${index}`;
}

function getOptionIdForRoute(route: ModuleRoute): OptionId {
  return route.type;
}

function getLegacyOptionIdForRoute(route: ModuleRoute): OptionId {
  return route.type === "comfort" ? "A" : "B";
}

function getRouteLabel(type: ModuleRouteType) {
  return type === "comfort" ? "顺着此刻" : "轻轻掰一下";
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
