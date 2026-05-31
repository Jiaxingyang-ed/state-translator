export type OptionId = "A" | "B";

export type StepConstraints = {
  time: string;
  budget: string;
};

export type FirstStep = {
  time: string;
  action: string;
  environment: string;
};

export type TimelineStep = FirstStep & {
  tip?: string;
};

export type RouteOption = {
  id: OptionId;
  title: string;
  reason: string;
  preview: string;
  firstStep: FirstStep;
  followingSteps: string[];
  timeline: TimelineStep[];
};

export type GeneratedRouteData = {
  routeId: string;
  translation: string;
  options: RouteOption[];
  unlockedOptionIds: OptionId[];
};

export type StoredRouteData = GeneratedRouteData & {
  userInput: string;
  constraints: StepConstraints;
};
