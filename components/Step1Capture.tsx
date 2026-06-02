"use client";

import { useState } from "react";
import type { RouteScale, StepConstraints, TimeScale } from "@/lib/routeTypes";

type StepTime = "1小时" | "今晚" | "周末" | "更长（7天+）";
type StepBudget = "0" | "20" | "100+";
type StepSocial = "Alone" | "Someone" | "Open";

type Step1Constraints = StepConstraints & {
  time: StepTime;
  budget: StepBudget;
  social: StepSocial;
};

type EntryScale = Extract<RouteScale, "tonight" | "weekend" | "meal">;

type Step1CaptureProps = {
  onSubmit: (
    input: string,
    constraints: Step1Constraints,
    scale: EntryScale,
    timeScale: TimeScale,
  ) => void;
};

const quickTags = [
  "脑子很吵",
  "想短暂消失",
  "需要犒劳自己",
  "什么都不想动",
  "想见人又怕累",
  "想换个空气",
];

const placeholders: Record<EntryScale, string> = {
  tonight: "比如：低电量，但不想太早睡。",
  weekend: "比如：想离开一下日常。",
  meal: "比如：想吃点认真做的东西。",
};

const timeOptions: Array<{ label: StepTime; value: TimeScale }> = [
  { label: "1小时", value: "1hour" },
  { label: "今晚", value: "tonight" },
  { label: "周末", value: "weekend" },
  { label: "更长（7天+）", value: "longer" },
];
const budgetOptions: StepBudget[] = ["0", "20", "100+"];
const socialOptions: StepSocial[] = ["Alone", "Someone", "Open"];
const extraScaleOptions: Array<{ label: string; value: EntryScale }> = [
  { label: "Weekend", value: "weekend" },
  { label: "Meal", value: "meal" },
];

function getGreeting() {
  const hour = new Date().getHours();

  if (hour >= 6 && hour < 11) {
    return {
      icon: "🌅",
      text: "早上好，今天打算怎么开始？",
    };
  }

  if (hour >= 11 && hour < 14) {
    return {
      icon: "☀️",
      text: "午间休息，要不要做点简单的？",
    };
  }

  if (hour >= 14 && hour < 18) {
    return {
      icon: "🌤️",
      text: "午后时光，适合做点放松的事",
    };
  }

  if (hour >= 18 && hour < 22) {
    return {
      icon: "🌆",
      text: "傍晚了，今晚想怎么过？",
    };
  }

  return {
    icon: "🌙",
    text: "夜深了，来点安静的事吧",
  };
}

export default function Step1Capture({ onSubmit }: Step1CaptureProps) {
  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showScales, setShowScales] = useState(false);
  const [scale, setScale] = useState<EntryScale>("tonight");
  const [timeScale, setTimeScale] = useState<TimeScale>("tonight");
  const [constraints, setConstraints] = useState<Step1Constraints>({
    time: "今晚",
    budget: "0",
    social: "Alone",
  });

  const canSubmit = input.trim().length > 0;
  const greeting = getGreeting();

  return (
    <section className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-5 py-12 sm:px-8">
      <div className="mb-8">
        <p className="mb-3 text-sm text-[#7d746b]">今晚</p>
        <h1 className="text-4xl font-light leading-tight text-[#29231f] sm:text-5xl">
          今晚想怎么过？
        </h1>
      </div>

      <div className="rounded-lg border border-[#eadfd4] bg-white p-5 shadow-sm sm:p-7">
        <div className="mb-4 flex min-h-11 items-center gap-3 rounded-lg bg-[#fbfaf7] px-4 py-3 text-[#655b52]">
          <span className="text-xl" aria-hidden="true">
            {greeting.icon}
          </span>
          <p className="text-base leading-6">{greeting.text}</p>
        </div>

        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={placeholders[scale]}
          className="min-h-40 w-full resize-none rounded-lg border border-[#eadfd4] bg-[#fffdfa] p-5 text-lg leading-8 text-[#29231f] outline-none transition focus:border-[#bfa98f] focus:ring-2 focus:ring-[#eadfd4]"
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {quickTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setInput(tag)}
              className="rounded-full border border-[#eadfd4] bg-[#fbfaf7] px-4 py-2 text-sm text-[#655b52] transition hover:border-[#cbb9a6] hover:bg-[#f7f1ea]"
            >
              {tag}
            </button>
          ))}
        </div>

        <div className="mt-6">
          <OptionGroup
            label="社交"
            options={socialOptions}
            value={constraints.social}
            onChange={(social) =>
              setConstraints((current) => ({ ...current, social }))
            }
          />
        </div>

        <button
          type="button"
          onClick={() => setShowSettings((value) => !value)}
          className="mt-6 flex w-full items-center justify-between border-t border-[#f0e7dd] pt-5 text-left text-sm text-[#746a61]"
          aria-expanded={showSettings}
        >
          <span>更多设置</span>
          <span>{showSettings ? "收起" : "展开"}</span>
        </button>

        {showSettings ? (
          <div className="mt-5 space-y-5">
            <TimeScaleGroup
              label="时间"
              options={timeOptions}
              value={timeScale}
              onChange={(option) => {
                setTimeScale(option.value);
                setConstraints((current) => ({
                  ...current,
                  time: option.label,
                }));
              }}
            />
            <OptionGroup
              label="预算"
              options={budgetOptions}
              value={constraints.budget}
              onChange={(budget) =>
                setConstraints((current) => ({ ...current, budget }))
              }
            />
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setShowScales((value) => !value)}
          className="mt-5 flex w-full items-center justify-between border-t border-[#f0e7dd] pt-5 text-left text-sm text-[#746a61]"
          aria-expanded={showScales}
        >
          <span>更多尺度</span>
          <span>{showScales ? "收起" : "展开"}</span>
        </button>

        {showScales ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            {extraScaleOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setScale(option.value)}
                className={`rounded-lg border px-4 py-3 text-sm transition ${
                  scale === option.value
                    ? "border-[#2e4d48] bg-[#e2eee9] text-[#203b37]"
                    : "border-[#eadfd4] bg-white text-[#6f665d] hover:bg-[#fbfaf7]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => onSubmit(input.trim(), constraints, scale, timeScale)}
          className="mt-7 w-full rounded-lg bg-[#2e4d48] px-5 py-4 text-base font-medium text-white transition hover:bg-[#243f3b] disabled:cursor-not-allowed disabled:bg-[#cfc7bd]"
        >
          看看怎么过
        </button>
      </div>
    </section>
  );
}

function TimeScaleGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<{ label: StepTime; value: TimeScale }>;
  value: TimeScale;
  onChange: (option: { label: StepTime; value: TimeScale }) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm text-[#7d746b]">{label}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-lg border px-4 py-2 text-sm transition ${
              value === option.value
                ? "border-[#2e4d48] bg-[#e2eee9] text-[#203b37]"
                : "border-[#eadfd4] bg-white text-[#6f665d] hover:bg-[#fbfaf7]"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function OptionGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm text-[#7d746b]">{label}</p>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-lg border px-4 py-2 text-sm transition ${
              value === option
                ? "border-[#2e4d48] bg-[#e2eee9] text-[#203b37]"
                : "border-[#eadfd4] bg-white text-[#6f665d] hover:bg-[#fbfaf7]"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
