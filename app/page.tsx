"use client";

import { useRouter } from "next/navigation";
import Step1Capture from "@/components/Step1Capture";
import type { RouteScale, TimeScale } from "@/lib/routeTypes";

type StepConstraints = {
  time: string;
  budget: string;
  social: string;
};

export default function Home() {
  const router = useRouter();

  const handleSubmit = (
    input: string,
    constraints: StepConstraints,
    scale: RouteScale,
    timeScale: TimeScale,
  ) => {
    sessionStorage.setItem("step1_input", input);
    sessionStorage.setItem("step1_constraints", JSON.stringify(constraints));
    sessionStorage.setItem("step1_scale", scale);
    sessionStorage.setItem("step1_timeScale", timeScale);
    sessionStorage.setItem("step1_social", constraints.social);
    sessionStorage.removeItem("step1_route_id");
    router.push("/step2");
  };

  return (
    <main className="min-h-screen bg-[#fbfaf7]">
      <Step1Capture onSubmit={handleSubmit} />
    </main>
  );
}
