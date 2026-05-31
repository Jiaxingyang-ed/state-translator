"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { StepConstraints } from "./Step1Capture";

type Step2DecisionProps = {
  userInput: string;
  constraints: StepConstraints;
};

type RouteOption = {
  id: "a" | "b";
  label: string;
  title: string;
  reason: string;
  preview: string;
  firstStep: TimelineStep;
  fullTimeline: TimelineStep[];
};

type TimelineStep = {
  time: string;
  action: string;
  environment: string;
  tip: string;
};

const routeOptions: RouteOption[] = [
  {
    id: "a",
    label: "A 安抚型",
    title: "低声量地把自己接回来",
    reason: "适合现在不想被催促、也不想彻底断线的状态。",
    preview: "先离开屏幕，再用一个很短的身体动作确认：我还在这里。",
    firstStep: {
      time: "0-12 分钟",
      action: "把手机放到看不见的位置，倒一杯温水，坐到离门或窗更近的地方。",
      environment: "灯光调暗一档，保留一点自然声，不额外放刺激内容。",
      tip: "目标不是开心起来，只是让身体知道今晚不用硬撑。",
    },
    fullTimeline: [
      {
        time: "0-12 分钟",
        action: "把手机放远，倒一杯温水，坐到离门或窗更近的地方。",
        environment: "灯光调暗，桌面只留下杯子和一件顺手的小物。",
        tip: "如果脑子还很吵，只数呼吸，不评判内容。",
      },
      {
        time: "12-28 分钟",
        action: "出门走到最近的便利店或楼下，买一件低负担的小东西。",
        environment: "选择熟悉路线，避开需要社交和排队太久的地点。",
        tip: "只完成“出去又回来”，不用制造精彩。",
      },
      {
        time: "28-45 分钟",
        action: "回家后把买来的东西摆好，开一首慢歌或白噪音。",
        environment: "让房间有一点秩序，哪怕只整理一小块桌面。",
        tip: "一个小范围变好，就足够成为今晚的支点。",
      },
      {
        time: "45-60 分钟",
        action: "写下三个词：现在的身体、想避开的事、明天最小的一步。",
        environment: "用纸笔，不用打开新的应用。",
        tip: "写词，不写长文，保持轻。",
      },
    ],
  },
  {
    id: "b",
    label: "B 微突破型",
    title: "给今晚开一个很小的窗",
    reason: "适合还剩一点点好奇心，想让状态被新鲜感轻轻推一下。",
    preview: "不安排完整社交，只给自己一个可撤退的外部坐标。",
    firstStep: {
      time: "0-10 分钟",
      action: "给一个低压力的人发一句：“我想出去透透气，但不一定聊天。”",
      environment: "发完先不等回复，去换一件舒服但能出门的衣服。",
      tip: "你是在制造可能性，不是在承诺一整晚。",
    },
    fullTimeline: [
      {
        time: "0-10 分钟",
        action: "发出一条低压力邀约，或把目的地发给自己收藏。",
        environment: "站起来换衣服，让身体先于情绪进入下一步。",
        tip: "对方没回也没关系，路线仍然成立。",
      },
      {
        time: "10-30 分钟",
        action: "去一个有光但不吵的地方：书店、咖啡窗口、河边、安静商场。",
        environment: "选择能坐下、能随时离开的地点。",
        tip: "只待 20 分钟，超过算赚到。",
      },
      {
        time: "30-55 分钟",
        action: "拍一张只给自己看的照片，记录今晚的颜色或声音。",
        environment: "避免刷信息流，把注意力放在现场的小细节。",
        tip: "新鲜感不必很大，能打断循环就好。",
      },
      {
        time: "55-75 分钟",
        action: "回程路上买一份明早会感谢自己的东西。",
        environment: "把回家也当成路线的一部分，不让结束显得突然。",
        tip: "给明天留一点照顾，是今晚最温柔的收尾。",
      },
      {
        time: "75-90 分钟",
        action: "到家后发一句简短反馈给自己或朋友：“我出去了一下，挺好。”",
        environment: "保持灯光温和，不再开启复杂任务。",
        tip: "完成感来自行动，不来自状态彻底变好。",
      },
    ],
  },
];

export default function Step2Decision({
  userInput,
  constraints,
}: Step2DecisionProps) {
  const [expanded, setExpanded] = useState<RouteOption["id"] | null>(null);
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [socialMode, setSocialMode] = useState<"独自" | "可约人">("独自");
  const [energyMode, setEnergyMode] = useState<"低能量" | "正常">("低能量");

  const handleUnlock = (optionId: RouteOption["id"]) => {
    alert("支付成功，完整路线已解锁。");
    setUnlocked((current) => ({ ...current, [optionId]: true }));
    setExpanded(optionId);
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#fbfaf7_0%,#edf5f1_45%,#f8eee5_100%)] px-5 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 rounded-lg border border-white/70 bg-white/70 p-5 shadow-sm backdrop-blur sm:p-7">
          <p className="mb-3 text-sm text-[#7d746b]">
            你输入的是：{userInput || "未命名状态"} · {constraints.time} ·{" "}
            {constraints.budget}
          </p>
          <h1 className="max-w-4xl text-3xl font-light leading-tight text-[#29231f] sm:text-4xl">
            你现在需要一种被缓慢包裹的感觉，而不是被热闹填满。
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
          {routeOptions.map((option) => {
            const isExpanded = expanded === option.id;
            const isUnlocked = unlocked[option.id];

            return (
              <motion.article
                layout
                key={option.id}
                className="rounded-lg border border-[#e8ded2] bg-white/85 p-5 shadow-sm backdrop-blur sm:p-6"
              >
                <div className="mb-5">
                  <p className="mb-2 text-sm text-[#2e4d48]">{option.label}</p>
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
                        <TimelineCard step={option.firstStep} index={1} />

                        {isUnlocked ? (
                          <>
                            <div className="space-y-3 pt-2">
                              {option.fullTimeline.slice(1).map((step, index) => (
                                <TimelineCard
                                  key={`${step.time}-${step.action}`}
                                  step={step}
                                  index={index + 2}
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
                          <LockedPreview
                            remaining={option.fullTimeline.length - 1}
                            onUnlock={() => handleUnlock(option.id)}
                          />
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
        <p>小提示：{step.tip}</p>
      </div>
    </div>
  );
}

function LockedPreview({
  remaining,
  onUnlock,
}: {
  remaining: number;
  onUnlock: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-lg border border-[#efe5db] bg-[#fffdfa] p-4">
        <div className="space-y-3 blur-sm">
          <div className="h-4 w-3/4 rounded bg-[#ded3c8]" />
          <div className="h-4 w-full rounded bg-[#eadfd4]" />
          <div className="h-4 w-2/3 rounded bg-[#ded3c8]" />
        </div>
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/45 text-center">
          <span aria-hidden="true" className="text-2xl">
            🔒
          </span>
          <p className="mt-2 text-sm font-medium text-[#433b34]">
            还有 {remaining} 步完整路线
          </p>
        </div>
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
