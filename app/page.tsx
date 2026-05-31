"use client";

import { useRouter } from "next/navigation";
import Step1Capture, { type StepConstraints } from "@/components/Step1Capture";

export default function Home() {
  const router = useRouter();

  const handleSubmit = (input: string, constraints: StepConstraints) => {
    sessionStorage.setItem("step1_input", input);
    sessionStorage.setItem("step1_constraints", JSON.stringify(constraints));
    router.push("/step2");
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#fbfaf7_0%,#edf5f1_48%,#f8eee5_100%)]">
      <Step1Capture onSubmit={handleSubmit} />
    </main>
  );
}
