export type OptionId = "A" | "B" | "comfort" | "shift";

export type RouteScale =
  | "auto"
  | "tonight"
  | "weekend"
  | "travel"
  | "meal"
  | "book"
  | "corner";

export type StepConstraints = {
  time: string;
  budget: string;
  social?: string;
  timeScale?: TimeScale;
};

export type TimeScale = "1hour" | "tonight" | "weekend" | "longer";

export type FirstStep = {
  time: string;
  action: string;
  environment: string;
  surprise?: string;
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
  scale: Exclude<RouteScale, "auto">;
  timeScale?: TimeScale;
  translation: string;
  options: unknown[];
  unlockedOptionIds: OptionId[];
};

export type StoredRouteData = GeneratedRouteData & {
  userInput: string;
  constraints: StepConstraints;
};
