"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GeneratedRouteData,
  OptionId,
  RouteScale,
  RouteOption,
  StepConstraints,
  TimelineStep,
} from "@/lib/routeTypes";

type Step2DecisionProps = {
  userInput: string;
  constraints: StepConstraints;
  scale: RouteScale;
  initialRouteData?: GeneratedRouteData | null;
  paidOptionId?: OptionId | null;
  unlockedTimeline?: TimelineStep[] | null;
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

export default function Step2Decision({
  userInput,
  constraints,
  scale,
  initialRouteData,
  paidOptionId,
  unlockedTimeline,
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
  const [activeUnlockedTimeline, setActiveUnlockedTimeline] = useState<
    TimelineStep[] | null
  >(unlockedTimeline ?? null);
  const [expanded, setExpanded] = useState<OptionId | null>(paidOptionId ?? null);
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackOptionId, setFeedbackOptionId] = useState<OptionId | null>(
    null,
  );
  const [isMember, setIsMember] = useState(false);
  const [socialMode, setSocialMode] = useState<"独自" | "可约人">("独自");
  const [energyMode, setEnergyMode] = useState<"低能量" | "正常">("低能量");
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

  const generateOptions = useCallback(async (regenerate = false) => {
    if (regenerate) {
      setIsRegenerating(true);
    } else {
      setIsLoading(true);
    }

    setError(null);
    setExpanded(null);
    setUnlocked({});

    try {
      if (regenerate) {
        setActivePaidOptionId(null);
        setActiveUnlockedTimeline(null);
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
  }, [constraints, scale, userInput]);

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
      setActiveUnlockedTimeline(unlockedTimeline ?? null);
      setUnlocked((current) => ({ ...current, [paidOptionId]: true }));
      setExpanded(paidOptionId);
    });
  }, [paidOptionId, unlockedTimeline]);

  const handleRegenerate = async () => {
    const now = Date.now();

    if (isRegenerating || now - lastRegenerateAt < 2000) {
      return;
    }

    setLastRegenerateAt(now);
    await generateOptions(true);
  };

  const handlePay = async (option: RouteOption) => {
    try {
      if (!data?.routeId) {
        throw new Error("路线尚未保存，请刷新后重试");
      }

      const anonymousId = getOrCreateAnonymousId();
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          optionId: option.id,
          routeId: data.routeId,
          anonymousId,
          planName: `${option.title}完整路线`,
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

      alert("已保存到我的行程。");
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
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fbfaf7_0%,#edf5f1_45%,#f8eee5_100%)] px-5">
        <div className="rounded-lg border border-white/70 bg-white/75 p-7 text-center shadow-sm backdrop-blur">
          <p className="text-lg font-light text-[#29231f]">
            正在翻译你的状态…
          </p>
          <p className="mt-3 text-sm text-[#7d746b]">
            我们会把它变成两条今晚能开始的路线。
          </p>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#fbfaf7_0%,#edf5f1_45%,#f8eee5_100%)] px-5">
        <div className="w-full max-w-md rounded-lg border border-[#eadfd4] bg-white/85 p-7 text-center shadow-sm backdrop-blur">
          <h1 className="text-2xl font-light text-[#29231f]">
            暂时没翻译出来
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

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#fbfaf7_0%,#edf5f1_45%,#f8eee5_100%)] px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 rounded-lg border border-white/70 bg-white/70 p-5 shadow-sm backdrop-blur sm:p-7">
          <p className="mb-3 text-sm text-[#7d746b]">
            你输入的是：{userInput || "未命名状态"} · {constraints.time} ·{" "}
            {constraints.budget} · {getScaleLabel(data.scale)}
          </p>
          <h1 className="max-w-4xl text-3xl font-light leading-tight text-[#29231f] sm:text-4xl">
            {data.translation}
          </h1>
        </div>

        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-[#e8ded2] bg-white/75 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-[#6f665d]">
            AI 推断：{socialMode} · {energyMode}
          </p>
          <div className="flex flex-wrap gap-2">
            <TogglePair
              values={["独自", "可约人"]}
              value={socialMode}
              onChange={(value) => {
                setSocialMode(value);
                console.log("social mode:", value);
              }}
            />
            <TogglePair
              values={["低能量", "正常"]}
              value={energyMode}
              onChange={(value) => {
                setEnergyMode(value);
                console.log("energy mode:", value);
              }}
            />
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          {data.options.map((option) => {
            const isMemberUnlocked = forceUnlockAll || isMember;
            const isExpanded = isMemberUnlocked || expanded === option.id;
            const isUnlocked =
              isMemberUnlocked ||
              unlocked[option.id] ||
              activePaidOptionId === option.id ||
              data.unlockedOptionIds.includes(option.id);
            const timeline =
              activePaidOptionId === option.id && activeUnlockedTimeline
                ? activeUnlockedTimeline
                : option.timeline;

            return (
              <motion.article
                layout
                key={option.id}
                className="rounded-lg border border-[#e8ded2] bg-white/85 p-5 shadow-sm backdrop-blur sm:p-6"
              >
                <div className="mb-5">
                  <p className="mb-2 text-sm text-[#2e4d48]">
                    {option.id === "A" ? "A 安抚型" : "B 微突破型"}
                  </p>
                  <h2 className="text-2xl font-light text-[#29231f]">
                    {option.title}
                  </h2>
                </div>
                <div className="space-y-4 text-sm leading-7 text-[#655b52]">
                  <p>
                    <span className="text-[#29231f]">适配理由：</span>
                    {option.reason}
                  </p>
                  <p>
                    <span className="text-[#29231f]">路线预览：</span>
                    {option.preview}
                  </p>
                </div>

                {!isMemberUnlocked ? (
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((current) =>
                        current === option.id ? null : option.id,
                      )
                    }
                    className="mt-6 w-full rounded-lg bg-[#2e4d48] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#243f3b]"
                  >
                    免费试第一步
                  </button>
                ) : null}

                <AnimatePresence initial={false}>
                  {isExpanded ? (
                    <motion.div
                      key="details"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <div className="mt-6 space-y-4">
                        {isUnlocked ? (
                          <>
                            <ScaleTimeline
                              scale={data.scale}
                              option={option}
                              timeline={timeline}
                            />
                            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                              <button
                                type="button"
                                onClick={() => void handleSaveTrip(option.id)}
                                className="flex-1 rounded-lg border border-[#2e4d48] px-4 py-3 text-sm font-medium text-[#2e4d48] transition hover:bg-[#e2eee9]"
                              >
                                保存到我的行程
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setFeedbackOptionId(option.id);
                                  setFeedbackOpen(true);
                                }}
                                className="flex-1 rounded-lg bg-[#9b6b55] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#805743]"
                              >
                                我完成了
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <TimelineCard step={option.firstStep} index={1} />
                            <LockedPreview
                              followingSteps={option.followingSteps}
                              onUnlock={() => void handlePay(option)}
                              onSubscribe={() => void handleSubscribe()}
                            />
                          </>
                        )}
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.article>
            );
          })}
        </div>

        {!forceUnlockAll ? (
          <div className="mt-7 flex justify-center">
            <button
              type="button"
              disabled={isRegenerating}
              onClick={() => void handleRegenerate()}
              className="rounded-lg border border-[#2e4d48] bg-white/70 px-5 py-3 text-sm font-medium text-[#2e4d48] shadow-sm transition hover:bg-[#e2eee9] disabled:cursor-not-allowed disabled:opacity-60"
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

function TogglePair<T extends string>({
  values,
  value,
  onChange,
}: {
  values: readonly [T, T];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-lg border border-[#ded3c8] bg-[#fbfaf7] p-1">
      {values.map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => onChange(item)}
          className={`rounded-md px-3 py-1.5 text-sm transition ${
            value === item
              ? "bg-[#2e4d48] text-white"
              : "text-[#6f665d] hover:bg-white"
          }`}
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function ScaleTimeline({
  scale,
  option,
  timeline,
}: {
  scale: Exclude<RouteScale, "auto">;
  option: RouteOption;
  timeline: TimelineStep[];
}) {
  if (scale === "travel") {
    const groupedSteps = groupTravelTimeline(timeline);

    return (
      <div className="space-y-4 pt-2">
        {groupedSteps.map((group) => (
          <div
            key={group.day}
            className="rounded-lg border border-[#eadfd4] bg-[#fffdfa] p-4"
          >
            <p className="mb-3 text-sm font-medium text-[#2e4d48]">
              {group.day}
            </p>
            <div className="space-y-3">
              {group.steps.map((step, index) => (
                <TimelineCard
                  key={`${group.day}-${step.time}-${step.action}`}
                  step={step}
                  index={index + 1}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (scale === "meal") {
    return (
      <div className="space-y-4 pt-2">
        <ListPanel
          title="食材清单"
          fallback={option.firstStep.environment}
          items={extractListItems(option.firstStep.environment)}
        />
        <div className="space-y-3">
          {timeline.map((step, index) => (
            <TimelineCard
              key={`${step.time}-${step.action}`}
              step={step}
              index={index + 1}
            />
          ))}
        </div>
      </div>
    );
  }

  if (scale === "book") {
    return (
      <div className="space-y-4 pt-2">
        <div className="grid gap-4 rounded-lg border border-[#eadfd4] bg-[#fffdfa] p-4 sm:grid-cols-[112px_1fr]">
          <div className="flex aspect-[3/4] items-center justify-center rounded-lg bg-[#e2eee9] text-4xl font-light text-[#2e4d48]">
            {option.title.slice(0, 1)}
          </div>
          <div className="space-y-3">
            <p className="text-sm text-[#9b6b55]">
              {extractAuthor(option.firstStep.environment)}
            </p>
            <h3 className="text-2xl font-light text-[#29231f]">
              {option.title}
            </h3>
            <p className="text-sm leading-6 text-[#655b52]">
              {option.preview}
            </p>
            <p className="text-sm leading-6 text-[#655b52]">
              推荐理由：{option.reason}
            </p>
          </div>
        </div>
        <div className="space-y-3">
          {timeline.map((step, index) => (
            <TimelineCard
              key={`${step.time}-${step.action}`}
              step={step}
              index={index + 1}
            />
          ))}
        </div>
      </div>
    );
  }

  if (scale === "corner") {
    return (
      <div className="space-y-4 pt-2">
        <ListPanel
          title="物品清单"
          fallback={option.firstStep.environment}
          items={extractListItems(option.firstStep.environment)}
        />
        <div className="space-y-3">
          {timeline.map((step, index) => (
            <TimelineCard
              key={`${step.time}-${step.action}`}
              step={step}
              index={index + 1}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-2">
      {timeline.map((step, index) => (
        <TimelineCard
          key={`${step.time}-${step.action}`}
          step={step}
          index={index + 1}
        />
      ))}
    </div>
  );
}

function TimelineCard({ step, index }: { step: TimelineStep; index: number }) {
  return (
    <div className="rounded-lg border border-[#efe5db] bg-[#fffdfa] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-[#2e4d48]">步骤 {index}</p>
        <p className="text-sm text-[#9b6b55]">{step.time}</p>
      </div>
      <p className="text-base leading-7 text-[#29231f]">{step.action}</p>
      <div className="mt-3 space-y-2 text-sm leading-6 text-[#6f665d]">
        <p>环境：{step.environment}</p>
        {step.surprise ? (
          <p className="italic text-[#9b6b55]">微小惊喜：{step.surprise}</p>
        ) : null}
        {step.tip ? <p>小提示：{step.tip}</p> : null}
      </div>
    </div>
  );
}

function ListPanel({
  title,
  fallback,
  items,
}: {
  title: string;
  fallback: string;
  items: string[];
}) {
  return (
    <div className="rounded-lg border border-[#eadfd4] bg-[#fffdfa] p-4">
      <p className="mb-3 text-sm font-medium text-[#2e4d48]">{title}</p>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <span
              key={item}
              className="rounded-full border border-[#eadfd4] bg-white px-3 py-1.5 text-sm text-[#655b52]"
            >
              {item}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm leading-6 text-[#655b52]">{fallback}</p>
      )}
    </div>
  );
}

function LockedPreview({
  followingSteps,
  onUnlock,
  onSubscribe,
}: {
  followingSteps: string[];
  onUnlock: () => void;
  onSubscribe: () => void;
}) {
  const [showPayGuide, setShowPayGuide] = useState(false);
  const firstLockedCardRef = useRef<HTMLDivElement | null>(null);
  const hasUserScrolledRef = useRef(false);

  useEffect(() => {
    hasUserScrolledRef.current = false;

    const timer = window.setTimeout(() => {
      setShowPayGuide(true);
    }, 5000);

    const node = firstLockedCardRef.current;
    const showWhenLockedAreaIsVisible = () => {
      if (!node) {
        return;
      }

      const rect = node.getBoundingClientRect();
      const isVisible = rect.top < window.innerHeight && rect.bottom > 0;

      if (isVisible) {
        setShowPayGuide(true);
      }
    };
    const handleScroll = () => {
      hasUserScrolledRef.current = true;
      showWhenLockedAreaIsVisible();
    };
    const observer =
      node && "IntersectionObserver" in window
        ? new IntersectionObserver(
            ([entry]) => {
              if (entry?.isIntersecting && hasUserScrolledRef.current) {
                setShowPayGuide(true);
              }
            },
            { threshold: 0.35 },
          )
        : null;

    if (node && observer) {
      observer.observe(node);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("scroll", handleScroll);
      observer?.disconnect();
    };
  }, [followingSteps]);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {followingSteps.map((step, index) => (
          <div
            key={`${step}-${index}`}
            ref={index === 0 ? firstLockedCardRef : undefined}
            className="relative overflow-hidden rounded-lg border border-[#efe5db] bg-[#fffdfa] p-4"
          >
            <p className="text-sm font-medium text-[#433b34]">
              {getLockedStepTitle(step)}
            </p>
            <p
              className={`${getLockedBlurClass(index)} mt-2 text-sm leading-6 text-[#655b52] opacity-75`}
            >
              {step}
            </p>
            <p className="mt-4 text-xs text-[#9b6b55]">
              还有 {followingSteps.length - index} 步
            </p>
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/45 text-center">
              <span aria-hidden="true" className="text-2xl">
                🔒
              </span>
              <p className="mt-2 text-sm font-medium text-[#433b34]">
                只差一点点
              </p>
            </div>
          </div>
        ))}
      </div>
      <AnimatePresence>
        {showPayGuide ? (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.24, ease: "easeOut" }}
            className="rounded-lg border border-[#eadfd4] bg-[#fbf4ec] p-4"
          >
            <p className="text-sm text-[#655b52]">
              我已经开始好奇完整路线了，解锁它吗？
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={onUnlock}
                className="rounded-lg bg-[#2e4d48] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#243f3b]"
              >
                $2.99 解锁本次
              </button>
              <div>
                <button
                  type="button"
                  onClick={onSubscribe}
                  className="w-full rounded-lg border border-[#9b6b55] px-4 py-3 text-sm font-medium text-[#805743] transition hover:bg-white"
                >
                  $7.99/月 成为会员
                </button>
                <p className="mt-2 text-center text-xs text-[#9b6b55]">
                  14天内可退款
                </p>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function getLockedStepTitle(step: string) {
  const trimmedStep = step.trim();

  if (trimmedStep.length <= 10) {
    return trimmedStep;
  }

  return `${trimmedStep.slice(0, 10)}…`;
}

function getLockedBlurClass(index: number) {
  if (index === 0) {
    return "blur-sm";
  }

  if (index === 1) {
    return "blur-md";
  }

  return "blur-lg";
}

function getScaleLabel(scale: RouteScale) {
  const labels: Record<RouteScale, string> = {
    auto: "自动尺度",
    tonight: "今晚",
    weekend: "周末",
    travel: "旅行",
    meal: "一顿饭",
    book: "一本书",
    corner: "一个角落",
  };

  return labels[scale];
}

function groupTravelTimeline(timeline: TimelineStep[]) {
  const groups = new Map<string, TimelineStep[]>();

  timeline.forEach((step, index) => {
    const explicitDay = step.time.match(/第[一二三四五六七八九十\d]+天|Day\s*\d+/i)?.[0];
    const fallbackDay = `第${Math.floor(index / 2) + 1}天`;
    const day = explicitDay ?? fallbackDay;

    groups.set(day, [...(groups.get(day) ?? []), step]);
  });

  return Array.from(groups.entries()).map(([day, steps]) => ({ day, steps }));
}

function extractListItems(text: string) {
  const normalizedText = text
    .replace(/^(食材|材料|物品|清单|环境|地点|准备)[：:]/, "")
    .replace(/[。.!！]$/, "");

  return normalizedText
    .split(/[、，,；;\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 16)
    .slice(0, 10);
}

function extractAuthor(text: string) {
  const authorMatch = text.match(/作者[：:]\s*([^，,；;\n]+)/);

  if (authorMatch?.[1]) {
    return `作者：${authorMatch[1].trim()}`;
  }

  return text.includes("作者") ? text : "作者信息会在路线里展开";
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
      alert("谢谢反馈");
      setSubmitted(true);
      setComment("");
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
                  placeholder="后来发生了什么？"
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
                    className="flex-1 rounded-lg bg-[#2e4d48] px-4 py-3 text-sm font-medium text-white"
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
