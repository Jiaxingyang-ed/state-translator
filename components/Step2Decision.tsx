"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { moduleLibrary, type LifeModule } from "@/lib/moduleLibrary";
import type {
  GeneratedRouteData,
  OptionId,
  RouteScale,
  StepConstraints,
} from "@/lib/routeTypes";

type ModuleRouteType = "comfort" | "shift";

type SelectedModule = {
  moduleId: string;
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

const moduleById = new Map(moduleLibrary.map((lifeModule) => [lifeModule.id, lifeModule]));

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
  const [activePaidOptionId, setActivePaidOptionId] = useState<OptionId | null>(
    paidOptionId ?? null,
  );
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackOptionId, setFeedbackOptionId] = useState<OptionId | null>(
    null,
  );
  const [isMember, setIsMember] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [lastRegenerateAt, setLastRegenerateAt] = useState(0);

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
      if (regenerate) {
        setIsRegenerating(true);
      } else {
        setIsLoading(true);
      }

      setError(null);
      setUnlocked({});

      try {
        if (regenerate) {
          setActivePaidOptionId(null);
          setFeedbackOpen(false);
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
        sessionStorage.setItem("step1_scale", result.data.scale);
        sessionStorage.setItem("step1_route_id", result.data.routeId);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error
            ? caughtError.message
            : "生成失败，请稍后重试";

        if (regenerate) {
          alert(message);
          return;
        }

        setData(null);
        setError(message);
      } finally {
        if (regenerate) {
          setIsRegenerating(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [constraints, scale, userInput],
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

  const handleRegenerate = async () => {
    const now = Date.now();

    if (isRegenerating || now - lastRegenerateAt < 2000) {
      return;
    }

    setLastRegenerateAt(now);
    await generateOptions(true);
  };

  const handlePay = async (route: ModuleRoute) => {
    try {
      if (!data?.routeId) {
        throw new Error("路线尚未保存，请刷新后重试");
      }

      const anonymousId = getOrCreateAnonymousId();
      const optionId = getOptionIdForRoute(route);
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          optionId,
          routeId: data.routeId,
          anonymousId,
          planName: `${getRouteLabel(route.type)}完整路线`,
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

  const handleSaveTrip = async (optionId: OptionId) => {
    try {
      if (!data?.routeId) {
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
          optionId,
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
          <p className="text-lg font-light text-[#29231f]">
            正在安排今晚…
          </p>
          <p className="mt-3 text-sm text-[#7d746b]">
            我们会从几个小模块里拼出两条路线。
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

  const moduleRouteData = toModuleRouteData(data);

  if (!moduleRouteData) {
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
    <main className="min-h-screen bg-[#fbfaf7] px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="mb-7 text-center">
          <p className="text-sm text-[#8a8178]">
            {userInput || "今晚"} · {constraints.time} · {constraints.budget} ·{" "}
            {getScaleLabel(moduleRouteData.scale)}
          </p>
          <h1 className="mt-3 text-3xl font-light leading-tight text-[#29231f] sm:text-4xl">
            {moduleRouteData.translation}
          </h1>
        </header>

        <div className="grid gap-5 lg:grid-cols-2">
          {moduleRouteData.options.map((route) => {
            const optionId = getOptionIdForRoute(route);
            const legacyOptionId = getLegacyOptionIdForRoute(route);
            const isRouteUnlocked =
              forceUnlockAll ||
              isMember ||
              unlocked[optionId] ||
              unlocked[legacyOptionId] ||
              activePaidOptionId === optionId ||
              activePaidOptionId === legacyOptionId ||
              moduleRouteData.unlockedOptionIds.includes(optionId) ||
              moduleRouteData.unlockedOptionIds.includes(legacyOptionId);

            return (
              <ModuleRouteArticle
                key={route.type}
                route={route}
                isUnlocked={isRouteUnlocked}
                onUnlock={() => void handlePay(route)}
                onSubscribe={() => void handleSubscribe()}
                onSave={() => void handleSaveTrip(optionId)}
                onComplete={() => {
                  setFeedbackOptionId(optionId);
                  setFeedbackOpen(true);
                }}
              />
            );
          })}
        </div>

        {!forceUnlockAll ? (
          <div className="mt-7 flex justify-center">
            <button
              type="button"
              disabled={isRegenerating}
              onClick={() => void handleRegenerate()}
              className="rounded-lg border border-[#2e4d48] bg-white px-5 py-3 text-sm font-medium text-[#2e4d48] shadow-sm transition hover:bg-[#e2eee9] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isRegenerating ? "正在找新路线…" : "换两个看看"}
            </button>
          </div>
        ) : null}
      </div>

      <FeedbackModal
        open={feedbackOpen}
        onClose={() => setFeedbackOpen(false)}
        onSubmit={handleFeedbackSubmit}
      />
    </main>
  );
}

function ModuleRouteArticle({
  route,
  isUnlocked,
  onUnlock,
  onSubscribe,
  onSave,
  onComplete,
}: {
  route: ModuleRoute;
  isUnlocked: boolean;
  onUnlock: () => void;
  onSubscribe: () => void;
  onSave: () => void;
  onComplete: () => void;
}) {
  const hasLockedModules = route.modules.length > 1 && !isUnlocked;

  return (
    <motion.article
      layout
      className="rounded-lg border border-[#e8ded2] bg-white p-5 shadow-sm sm:p-6"
    >
      <div className="mb-5">
        <p className="mb-2 text-sm text-[#2e4d48]">
          {getRouteLabel(route.type)} · {route.totalDuration} 分钟
        </p>
        <p className="text-center text-sm leading-6 text-[#9a9188]">
          {route.intro}
        </p>
      </div>

      <div className="space-y-4">
        {route.modules.map((selectedModule, index) => {
          const moduleDefinition = moduleById.get(selectedModule.moduleId);
          const isFreeFirstModule = index === 0;
          const isModuleUnlocked = isUnlocked || isFreeFirstModule;
          const transition = route.transitions[index];

          return (
            <div key={`${route.type}-${selectedModule.moduleId}-${index}`}>
              <ModuleCard
                moduleDefinition={moduleDefinition}
                customContext={selectedModule.customContext}
                isLocked={!isModuleUnlocked}
                isFirst={isFreeFirstModule}
              />
              {transition ? <RouteTransition text={transition} /> : null}
            </div>
          );
        })}
      </div>

      {hasLockedModules ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
          className="mt-5 rounded-lg border border-[#eadfd4] bg-[#fbf4ec] p-4"
        >
          <p className="text-sm font-medium text-[#433b34]">
            后续模块已锁定
          </p>
          <p className="mt-1 text-sm leading-6 text-[#655b52]">
            解锁后会展开所有步骤，也可以成为会员直接查看完整路线。
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={onUnlock}
              className="rounded-lg bg-[#2e4d48] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#243f3b]"
            >
              解锁本次 ($2.99)
            </button>
            <div>
              <button
                type="button"
                onClick={onSubscribe}
                className="w-full rounded-lg border border-[#9b6b55] bg-white/70 px-4 py-3 text-sm font-medium text-[#805743] transition hover:bg-white"
              >
                成为会员 ($7.99/月)
              </button>
              <p className="mt-2 text-center text-xs text-[#9b6b55]">
                14天内可退款
              </p>
            </div>
          </div>
        </motion.div>
      ) : null}

      {isUnlocked ? (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onSave}
            className="flex-1 rounded-lg border border-[#2e4d48] px-4 py-3 text-sm font-medium text-[#2e4d48] transition hover:bg-[#e2eee9]"
          >
            保存到我的行程
          </button>
          <button
            type="button"
            onClick={onComplete}
            className="flex-1 rounded-lg bg-[#9b6b55] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#805743]"
          >
            我完成了
          </button>
        </div>
      ) : null}
    </motion.article>
  );
}

function ModuleCard({
  moduleDefinition,
  customContext,
  isLocked,
  isFirst,
}: {
  moduleDefinition: LifeModule | undefined;
  customContext?: string;
  isLocked: boolean;
  isFirst: boolean;
}) {
  const moduleName = moduleDefinition?.name ?? "未知模块";
  const duration = moduleDefinition?.duration ?? 0;
  const instructions = moduleDefinition?.instructions ?? [];
  const preview = instructions[0]?.slice(0, 20) ?? "步骤将在模块库中补齐";

  return (
    <div
      className={`relative overflow-hidden rounded-lg border p-4 transition ${
        isLocked
          ? "border-[#eadfd4] bg-[#fffdfa]"
          : "border-[#d9e8e1] bg-[#fbfffd]"
      }`}
    >
      <div className={isLocked ? "blur-md opacity-45" : ""}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-medium text-[#29231f]">
              {moduleName}
            </p>
            <p className="mt-1 text-sm leading-6 text-[#7d746b]">{preview}</p>
          </div>
          <span className="shrink-0 rounded-full border border-[#eadfd4] bg-white px-3 py-1 text-xs text-[#655b52]">
            ⏱ {duration} 分钟
          </span>
        </div>

        {customContext ? (
          <p className="mt-3 text-sm leading-6 text-[#9b6b55]">
            {customContext}
          </p>
        ) : null}

        {!isLocked ? (
          <div className="mt-4">
            {isFirst ? (
              <p className="mb-2 text-xs font-medium text-[#2e4d48]">
                免费试第一步
              </p>
            ) : null}
            <ol className="space-y-2">
              {instructions.map((instruction, index) => (
                <li
                  key={`${instruction}-${index}`}
                  className="flex gap-3 text-sm leading-6 text-[#655b52]"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e2eee9] text-xs text-[#2e4d48]">
                    {index + 1}
                  </span>
                  <span>{instruction}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>

      {isLocked ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 p-4 backdrop-blur-[2px]">
          <div className="rounded-lg border border-[#eadfd4] bg-white px-4 py-3 text-center shadow-sm">
            <p className="text-2xl" aria-hidden="true">
              🔒
            </p>
            <p className="mt-2 text-sm font-medium text-[#433b34]">
              解锁后可查看完整步骤
            </p>
          </div>
        </div>
      ) : null}
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
                  下次任何说不清的状态，都可以来这里翻译成一种活法。
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
                    {isSubmitting ? "提交中..." : "提交"}
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

  if (!Array.isArray(options) || !options.every(isModuleRoute)) {
    return null;
  }

  return {
    ...data,
    options,
  };
}

function isModuleRoute(value: unknown): value is ModuleRoute {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.intro === "string" &&
    Array.isArray(value.modules) &&
    value.modules.length >= 1 &&
    value.modules.every(isSelectedModule) &&
    Array.isArray(value.transitions) &&
    value.transitions.every((transition) => typeof transition === "string") &&
    typeof value.totalDuration === "number" &&
    (value.type === "comfort" || value.type === "shift")
  );
}

function isSelectedModule(value: unknown): value is SelectedModule {
  if (!isRecord(value) || typeof value.moduleId !== "string") {
    return false;
  }

  return (
    value.customContext === undefined ||
    typeof value.customContext === "string"
  );
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
