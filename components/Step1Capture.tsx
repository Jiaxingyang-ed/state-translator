"use client";

import { useState } from "react";
import type { RouteScale, StepConstraints } from "@/lib/routeTypes";

type StepTime = "1小时" | "今晚" | "周末";
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

const timeOptions: StepTime[] = ["1小时", "今晚", "周末"];
const budgetOptions: StepBudget[] = ["0", "20", "100+"];
const socialOptions: StepSocial[] = ["Alone", "Someone", "Open"];
const extraScaleOptions: Array<{ label: string; value: EntryScale }> = [
  { label: "Weekend", value: "weekend" },
  { label: "Meal", value: "meal" },
];

export default function Step1Capture({ onSubmit }: Step1CaptureProps) {
  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showScales, setShowScales] = useState(false);
  const [scale, setScale] = useState<EntryScale>("tonight");
  const [constraints, setConstraints] = useState<Step1Constraints>({
    time: "今晚",
    budget: "0",
    social: "Alone",
  });

  const canSubmit = input.trim().length > 0;

  return (
    <section className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-5 py-12 sm:px-8">
      <div className="mb-8">
        <p className="mb-3 text-sm text-[#7d746b]">今晚</p>
        <h1 className="text-4xl font-light leading-tight text-[#29231f] sm:text-5xl">
          今晚想怎么过？
        </h1>
      </div>

      <div className="rounded-lg border border-[#eadfd4] bg-white p-5 shadow-sm sm:p-7">
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
            <OptionGroup
              label="时间"
              options={timeOptions}
              value={constraints.time}
              onChange={(time) =>
                setConstraints((current) => ({ ...current, time }))
              }
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
          onClick={() => onSubmit(input.trim(), constraints, scale)}
          className="mt-7 w-full rounded-lg bg-[#2e4d48] px-5 py-4 text-base font-medium text-white transition hover:bg-[#243f3b] disabled:cursor-not-allowed disabled:bg-[#cfc7bd]"
        >
          看看怎么过
        </button>
      </div>
    </section>
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
