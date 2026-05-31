"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Step2Decision from "@/components/Step2Decision";
import type { StepConstraints } from "@/components/Step1Capture";

type Step1State = {
  input: string;
  constraints: StepConstraints;
};

export default function Step2Page() {
  const router = useRouter();
  const [step1State, setStep1State] = useState<Step1State | null>(null);

  useEffect(() => {
    queueMicrotask(() => {
      const input = sessionStorage.getItem("step1_input");
      const storedConstraints = sessionStorage.getItem("step1_constraints");

      if (!input || !storedConstraints) {
        router.replace("/");
        return;
      }

      try {
        setStep1State({
          input,
          constraints: JSON.parse(storedConstraints) as StepConstraints,
        });
      } catch {
        router.replace("/");
      }
    });
  }, [router]);

  if (!step1State) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#fbfaf7] text-[#655b52]">
        加载中...
      </main>
    );
  }

  return (
    <Step2Decision
      userInput={step1State.input}
      constraints={step1State.constraints}
    />
  );
}
