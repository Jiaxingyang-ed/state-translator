"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import type { StepConstraints } from "./Step1Capture";

type Step2DecisionProps = {
  userInput: string;
  constraints: StepConstraints;
  paidOptionId?: RouteOption["id"] | null;
};

type RouteOption = {
  id: "A" | "B";
  title: string;
  reason: string;
  preview: string;
  firstStep: FirstStep;
  followingSteps: string[];
  timeline: TimelineStep[];
};

type GeneratedData = {
  translation: string;
  options: RouteOption[];
};

type GenerateOptionsApiResponse =
  | {
      success: true;
      data: GeneratedData;
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

type FirstStep = {
  time: string;
  action: string;
  environment: string;
};

type TimelineStep = FirstStep & {
  tip?: string;
};

export default function Step2Decision({
  userInput,
  constraints,
  paidOptionId,
}: Step2DecisionProps) {
  const [data, setData] = useState<GeneratedData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<RouteOption["id"] | null>(null);
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [socialMode, setSocialMode] = useState<"独自" | "可约人">("独自");
  const [energyMode, setEnergyMode] = useState<"低能量" | "正常">("低能量");

  const generateOptions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setExpanded(null);
    setUnlocked({});

    try {
      const response = await fetch("/api/generate-options", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputText: userInput,
          constraints,
        }),
      });

      const result = (await response.json()) as GenerateOptionsApiResponse;

      if (!response.ok || "error" in result) {
        throw new Error(
          "error" in result ? result.error : "生成失败，请稍后重试",
        );
      }

      setData(result.data);
    } catch (caughtError) {
      setData(null);
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "生成失败，请稍后重试",
      );
    } finally {
      setIsLoading(false);
    }
  }, [constraints, userInput]);

  useEffect(() => {
    queueMicrotask(() => {
      void generateOptions();
    });
  }, [generateOptions]);

  useEffect(() => {
    if (!paidOptionId) {
      return;
    }

    queueMicrotask(() => {
      setUnlocked((current) => ({ ...current, [paidOptionId]: true }));
      setExpanded(paidOptionId);
    });
  }, [paidOptionId]);

  const handlePay = async (option: RouteOption) => {
    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          optionId: option.id,
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
            {constraints.budget}
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
            const isExpanded = expanded === option.id;
            const isUnlocked = unlocked[option.id] || paidOptionId === option.id;

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
                            <div className="space-y-3 pt-2">
                              {option.timeline.map((step, index) => (
                                <TimelineCard
                                  key={`${step.time}-${step.action}`}
                                  step={step}
                                  index={index + 1}
                                />
                              ))}
                            </div>
                            <div className="flex flex-col gap-3 pt-2 sm:flex-row">
                              <button
                                type="button"
                                onClick={() => alert("已保存到我的行程。")}
                                className="flex-1 rounded-lg border border-[#2e4d48] px-4 py-3 text-sm font-medium text-[#2e4d48] transition hover:bg-[#e2eee9]"
                              >
                                保存到我的行程
                              </button>
                              <button
                                type="button"
                                onClick={() => setFeedbackOpen(true)}
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
      </div>

      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
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
        {step.tip ? <p>小提示：{step.tip}</p> : null}
      </div>
    </div>
  );
}

function LockedPreview({
  followingSteps,
  onUnlock,
}: {
  followingSteps: string[];
  onUnlock: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {followingSteps.map((step, index) => (
          <div
            key={`${step}-${index}`}
            className="relative overflow-hidden rounded-lg border border-[#efe5db] bg-[#fffdfa] p-4"
          >
            <p className="blur-sm text-sm leading-6 text-[#655b52]">{step}</p>
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/55 text-center">
              <span aria-hidden="true" className="text-2xl">
                🔒
              </span>
              <p className="mt-2 text-sm font-medium text-[#433b34]">
                后续步骤 {index + 1}
              </p>
            </div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-[#eadfd4] bg-[#fbf4ec] p-4">
        <p className="text-sm text-[#655b52]">
          解锁完整路线 $2.99 /次，或会员 $7.99/月
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onUnlock}
            className="rounded-lg bg-[#2e4d48] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#243f3b]"
          >
            解锁本次
          </button>
          <button
            type="button"
            onClick={() => alert("会员功能已为你模拟开启。")}
            className="rounded-lg border border-[#9b6b55] px-4 py-3 text-sm font-medium text-[#805743] transition hover:bg-white"
          >
            成为会员
          </button>
        </div>
      </div>
    </div>
  );
}

function FeedbackModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [submitted, setSubmitted] = useState(false);

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
                      className="rounded-lg border border-[#eadfd4] bg-[#fbfaf7] px-3 py-3 text-sm text-[#655b52] transition hover:border-[#2e4d48]"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <textarea
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
                    onClick={() => setSubmitted(true)}
                    className="flex-1 rounded-lg bg-[#2e4d48] px-4 py-3 text-sm font-medium text-white"
                  >
                    提交
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
