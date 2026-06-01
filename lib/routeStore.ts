import { createSupabaseServerClient } from "@/lib/supabaseClient";
import type {
  OptionId,
  RouteScale,
  RouteOption,
  StepConstraints,
  StoredRouteData,
} from "@/lib/routeTypes";

type GeneratedRouteRow = {
  id: string;
  user_input: string;
  constraints: StepConstraints;
  scale: RouteScale;
  translation: string;
  options: RouteOption[];
};

type UnlockRow = {
  option_id: string;
};

export async function getStoredRoute(
  routeId: string,
  anonymousId: string,
): Promise<StoredRouteData | null> {
  const supabase = createSupabaseServerClient();

  const { data: routeRow, error: routeError } = await supabase
    .from("generated_routes")
    .select("id, user_input, constraints, scale, translation, options")
    .eq("id", routeId)
    .eq("anonymous_id", anonymousId)
    .single();

  if (routeError || !routeRow) {
    console.error("generated_routes select error:", routeError);
    return null;
  }

  const { data: unlockRows, error: unlockError } = await supabase
    .from("unlocks")
    .select("option_id")
    .eq("route_id", routeId)
    .eq("anonymous_id", anonymousId);

  if (unlockError) {
    console.error("unlocks select error:", unlockError);
  }

  const typedRoute = routeRow as GeneratedRouteRow;
  const typedUnlocks = (unlockRows ?? []) as UnlockRow[];
  const unlockedOptionIds = typedUnlocks
    .map((row) => normalizeOptionId(row.option_id))
    .filter((value): value is OptionId => value !== null);

  return {
    routeId: typedRoute.id,
    userInput: typedRoute.user_input,
    constraints: typedRoute.constraints,
    scale: normalizeScale(typedRoute.scale),
    translation: typedRoute.translation,
    options: typedRoute.options,
    unlockedOptionIds,
  };
}

function normalizeOptionId(value: string): OptionId | null {
  return value === "A" ||
    value === "B" ||
    value === "comfort" ||
    value === "shift"
    ? value
    : null;
}

function normalizeScale(value: string | null | undefined): Exclude<RouteScale, "auto"> {
  if (
    value === "weekend" ||
    value === "travel" ||
    value === "meal" ||
    value === "book" ||
    value === "corner"
  ) {
    return value;
  }

  return "tonight";
}
