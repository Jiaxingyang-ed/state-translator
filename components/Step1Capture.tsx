"use client";

import { useState } from "react";
import type { StepConstraints } from "@/lib/routeTypes";

type StrictStepConstraints = {
  time: "今晚" | "周末" | "更长";
  budget: "0元" | "200内" | "500内" | "不限";
};

type Step1CaptureProps = {
  onSubmit: (input: string, constraints: StepConstraints) => void;
};

const quickTags = [
  "脑子很吵",
  "想短暂消失",
  "需要犒劳自己",
  "什么都不想动",
  "想见人又怕累",
  "想换个空气",
];

const timeOptions: StrictStepConstraints["time"][] = ["今晚", "周末", "更长"];
const budgetOptions: StrictStepConstraints["budget"][] = [
  "0元",
  "200内",
  "500内",
  "不限",
];

export default function Step1Capture({ onSubmit }: Step1CaptureProps) {
  const [input, setInput] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [constraints, setConstraints] = useState<StrictStepConstraints>({
    time: "今晚",
    budget: "0元",
  });

  const canSubmit = input.trim().length > 0;

  return (
    <section className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-5 py-12 sm:px-8">
      <div className="mb-10">
        <p className="mb-3 text-sm text-[#7d746b]">状态翻译器</p>
        <h1 className="max-w-2xl text-4xl font-light leading-tight text-[#29231f] sm:text-5xl">
          把现在说不清的感觉，翻译成一种今晚能开始的活法。
        </h1>
      </div>

      <div className="rounded-lg border border-[#efe7dc] bg-white/85 p-5 shadow-sm backdrop-blur sm:p-7">
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="比如：低电量，想自己待着，但又不想闷在家里"
          className="min-h-44 w-full resize-none rounded-lg border border-[#eadfD4] bg-[#fffdfa] p-5 text-lg leading-8 text-[#29231f] outline-none transition focus:border-[#d3b99d] focus:ring-4 focus:ring-[#f3dcc3]/45"
        />

        <div className="mt-4 flex flex-wrap gap-2">
          {quickTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setInput(tag)}
              className="rounded-full border border-[#eadfD4] bg-[#fbf4ec] px-4 py-2 text-sm text-[#655b52] transition hover:border-[#d4b79b] hover:bg-[#f7eadc]"
            >
              {tag}
            </button>
          ))}
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
              onChange={(time) => setConstraints((current) => ({ ...current, time }))}
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
          disabled={!canSubmit}
          onClick={() => onSubmit(input.trim(), constraints)}
          className="mt-7 w-full rounded-lg bg-[#2e4d48] px-5 py-4 text-base font-medium text-white transition hover:bg-[#243f3b] disabled:cursor-not-allowed disabled:bg-[#cfc7bd]"
        >
          看看可以怎么过
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
      <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-lg border px-4 py-2 text-sm transition ${
              value === option
                ? "border-[#2e4d48] bg-[#e2eee9] text-[#203b37]"
                : "border-[#eadfD4] bg-white text-[#6f665d] hover:bg-[#fbf4ec]"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
