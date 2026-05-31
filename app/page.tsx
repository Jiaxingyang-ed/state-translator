"use client";

import { useRouter } from "next/navigation";
import Step1Capture from "@/components/Step1Capture";
import type { RouteScale } from "@/lib/routeTypes";

type StepConstraints = {
  time: string;
  budget: string;
};

export default function Home() {
  const router = useRouter();

  const handleSubmit = (
    input: string,
    constraints: StepConstraints,
    scale: RouteScale,
  ) => {
    sessionStorage.setItem("step1_input", input);
    sessionStorage.setItem("step1_constraints", JSON.stringify(constraints));
    sessionStorage.setItem("step1_scale", scale);
    sessionStorage.removeItem("step1_route_id");
    router.push("/step2");
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#fbfaf7_0%,#edf5f1_48%,#f8eee5_100%)]">
      <Step1Capture onSubmit={handleSubmit} />
    </main>
  );
}
