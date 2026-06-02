import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getCityFromIP } from "@/lib/ipLocation";
import { moduleLibrary } from "@/lib/moduleLibrary";
import { createSupabaseServerClient } from "@/lib/supabaseClient";
import { getUserHistory } from "@/lib/userHistory";
import { getWeatherByCity, type WeatherSummary } from "@/lib/weather";
import type { GeneratedRouteData, RouteScale, TimeScale } from "@/lib/routeTypes";

type SupportedScale = Extract<RouteScale, "tonight" | "weekend" | "meal">;
type PlanKind = "linear" | "weekend" | "longer";
type PlanType = "comfort" | "shift";

type RequestBody = {
  inputText?: unknown;
  anonymousId?: unknown;
  regenerate?: unknown;
  scale?: unknown;
  timeScale?: unknown;
  constraints?: {
    time?: unknown;
    budget?: unknown;
    social?: unknown;
    timeScale?: unknown;
  };
};

type SelectedModule = {
  moduleId: string;
  customContext?: string;
};

type Anchor = SelectedModule & {
  day: number;
};

type LinearPlan = {
  kind: "linear";
  intro: string;
  type: PlanType;
  modules: SelectedModule[];
  totalDuration: number;
  timeScale: Extract<TimeScale, "1hour" | "tonight">;
};

type WeekendPlan = {
  kind: "weekend";
  intro: string;
  type: PlanType;
  saturdayModules: SelectedModule[];
  sundayModules: SelectedModule[];
  totalDuration: number;
  timeScale: "weekend";
};

type LongerPlan = {
  kind: "longer";
  theme: string;
  type: PlanType;
  anchors: Anchor[];
  timeScale: "longer";
};

type GeneratedPlan = LinearPlan | WeekendPlan | LongerPlan;

type GeneratedPlansResponse = {
  plans: GeneratedPlan[];
};

const moduleIdSet = new Set(moduleLibrary.map((module) => module.id));
const moduleById = new Map(moduleLibrary.map((module) => [module.id, module]));
const moduleIdByName = new Map(moduleLibrary.map((module) => [module.name, module.id]));
const MODULE_CATALOG = moduleLibrary
  .map(
    (module) =>
      `${module.id} | ${module.name} | ${module.category} | ${module.duration}min | ${module.energyLevel}`,
  )
  .join("\n");

const COMMON_RULES = `
可用模块如下，每行格式为：moduleId | name | category | duration | energyLevel
${MODULE_CATALOG}

硬性规则：
- moduleId 必须来自模块库，不允许编造。
- customContext 是一句具体前置语，不要生成步骤。
- 不要诊断用户，不要使用治疗、疗愈、创伤等词。
- 不要输出 Markdown，不要代码块，不要额外解释。
- 严格只返回 JSON。
`.trim();

const LINEAR_PROMPT = `
你是一位生活节奏编排师。用户需要一段短时间的线性体验（1小时或一个晚上）。
请从模块库中选择 3-4 个模块，按“启动→投入→收束”的顺序排列。

输出 JSON 格式：
{
  "intro": "一句话开场白（10字内）",
  "type": "comfort" | "shift",
  "modules": [
    { "moduleId": "mod_slow_cooking", "customContext": "个性化前置语（可选）" }
  ]
}

不要超过4个模块。不要输出过渡语。
`.trim();

const WEEKEND_PROMPT = `
你是一位生活节奏编排师。用户需要一份周末安排（两天）。
请输出两个模块序列：周六（3-5个模块，基调稍活跃）和周日（3-5个模块，基调稍舒缓）。

输出 JSON 格式：
{
  "intro": "一句话周末开场白",
  "type": "comfort" | "shift",
  "saturdayModules": [
    { "moduleId": "...", "customContext": "..." }
  ],
  "sundayModules": [
    { "moduleId": "...", "customContext": "..." }
  ]
}
`.trim();

const LONGER_PROMPT = `
你是一位生活策划师。用户需要一份超过一周的生活基调规划。
请输出一个生活主题和 3-5 个关键锚点事件（每 2-3 天一个）。

输出 JSON 格式：
{
  "theme": "例如：恢复精力周",
  "anchors": [
    { "day": 1, "moduleId": "mod_slow_cooking", "customContext": "下班后慢慢做一顿饭" },
    { "day": 3, "moduleId": "mod_evening_walk", "customContext": "去河边走半小时" }
  ]
}
`.trim();

function buildSystemPrompt(timeScale: TimeScale) {
  const selectedPrompt =
    timeScale === "weekend"
      ? WEEKEND_PROMPT
      : timeScale === "longer"
        ? LONGER_PROMPT
        : LINEAR_PROMPT;

  return [
    selectedPrompt,
    `当前 timeScale = ${timeScale}。根据时间尺度不同，输出结构应不同；后续会继续补充更细规则。`,
    COMMON_RULES,
  ].join("\n\n");
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody;
    const inputText =
      typeof body.inputText === "string" ? body.inputText.trim() : "";
    const anonymousId =
      typeof body.anonymousId === "string" ? body.anonymousId.trim() : "";
    const time =
      typeof body.constraints?.time === "string"
        ? body.constraints.time.trim()
        : "";
    const budget =
      typeof body.constraints?.budget === "string"
        ? body.constraints.budget.trim()
        : "";
    const social =
      typeof body.constraints?.social === "string"
        ? body.constraints.social.trim()
        : "Alone";
    const scale = normalizeScale(body.scale);
    const timeScale = normalizeTimeScale(
      body.timeScale ?? body.constraints?.timeScale,
    );
    const regenerate = body.regenerate === true;

    if (!inputText) {
      return NextResponse.json(
        { error: "inputText 不能为空" },
        { status: 400 },
      );
    }

    if (!anonymousId) {
      return NextResponse.json(
        { error: "anonymousId 不能为空" },
        { status: 400 },
      );
    }

    if (!time || !budget) {
      return NextResponse.json(
        { error: "constraints.time 和 constraints.budget 不能为空" },
        { status: 400 },
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const baseURL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1";

    if (!apiKey) {
      return NextResponse.json(
        { error: "缺少 OPENAI_API_KEY 环境变量" },
        { status: 500 },
      );
    }

    const client = new OpenAI({
      apiKey,
      baseURL,
    });
    const clientIp = getClientIp(request);
    const context = await getGenerationContext(clientIp, anonymousId);

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(timeScale),
        },
        {
          role: "user",
          content: [
            `用户状态：${inputText}`,
            `时间尺度：${timeScale}`,
            `约束：${JSON.stringify({ time, budget, social })}`,
            `scale：${scale}`,
            formatLocationLine(context.location),
            formatWeatherLine(context.weather),
            formatHistoryLine(context.history.likedModuleIds),
            buildWeatherGuidance(context.weather),
            regenerate
              ? "重新生成：这是用户点击“换一种安排”的请求，请选择不同模块组合，避免与上一组过于相似。"
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.72,
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "AI 没有返回内容" },
        { status: 502 },
      );
    }

    const data = parseGeneratedPlans(content, timeScale);

    if (!data) {
      console.error("AI plan parse error:", content.slice(0, 1200));
      return NextResponse.json(
        { error: "AI 返回格式不正确，请重试" },
        { status: 502 },
      );
    }

    const supabase = createSupabaseServerClient();
    const translation = buildTranslation(data.plans, timeScale);
    const { data: insertedRoute, error: insertError } = await supabase
      .from("generated_routes")
      .insert({
        anonymous_id: anonymousId,
        user_input: inputText,
        constraints: { time, budget, social, timeScale },
        scale,
        translation,
        options: data.plans,
      })
      .select("id")
      .single();

    if (insertError || !insertedRoute) {
      console.error("generated_routes insert error:", insertError);

      if (isMissingScaleColumnError(insertError)) {
        return NextResponse.json(
          { error: "数据库缺少 scale 字段，请先执行 Supabase 迁移" },
          { status: 500 },
        );
      }

      return NextResponse.json(
        { error: "保存生成路线失败，请稍后重试" },
        { status: 500 },
      );
    }

    const responseData: GeneratedRouteData = {
      routeId: insertedRoute.id as string,
      scale,
      timeScale,
      translation,
      options: data.plans,
      unlockedOptionIds: [],
    };

    return NextResponse.json({ success: true, data: responseData });
  } catch (error) {
    console.error("generate-options error:", error);

    return NextResponse.json(
      { error: "生成路线失败，请稍后重试" },
      { status: 500 },
    );
  }
}

async function getGenerationContext(clientIp: string | null, anonymousId: string) {
  const location = await getCityFromIP(clientIp);
  const [weather, history] = await Promise.all([
    location.city
      ? getWeatherByCity(location.city)
      : Promise.resolve<WeatherSummary>({ condition: "unknown", temp: null }),
    getUserHistory(anonymousId),
  ]);

  return { location, weather, history };
}

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null;
  }

  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    null
  );
}

function formatLocationLine(location: { city: string | null; country: string | null }) {
  if (!location.city && !location.country) {
    return "用户位置：未知。";
  }

  return `用户位置：${[location.city, location.country].filter(Boolean).join(", ")}。`;
}

function formatWeatherLine(weather: WeatherSummary) {
  if (weather.condition === "unknown" || weather.temp === null) {
    return "当前天气：未知。";
  }

  return `当前天气：${getWeatherConditionLabel(weather.condition)}，温度 ${Math.round(
    weather.temp,
  )}°C。`;
}

function formatHistoryLine(likedModuleIds: string[]) {
  if (likedModuleIds.length === 0) {
    return "用户历史上喜欢的模块ID：[]。";
  }

  return `用户历史上喜欢的模块ID：${JSON.stringify(
    likedModuleIds,
  )}（请参考这些偏好，但不要重复到无聊）。`;
}

function buildWeatherGuidance(weather: WeatherSummary) {
  if (weather.condition === "rain" || weather.condition === "drizzle") {
    return "天气指令：如果天气是雨天，不要推荐户外散步类模块，优先室内 food、space、mind 模块。";
  }

  if (weather.condition === "snow") {
    return "天气指令：如果天气是雪天，避免长时间户外模块，优先温暖、室内、低风险模块。";
  }

  if (weather.condition === "clear") {
    return "天气指令：天气晴朗，可以适度增加短距离 movement 模块，但仍需遵守用户精力和社交约束。";
  }

  return "天气指令：天气不明确时，不要过度依赖户外模块。";
}

function getWeatherConditionLabel(condition: WeatherSummary["condition"]) {
  const labels: Record<WeatherSummary["condition"], string> = {
    rain: "雨天",
    clear: "晴天",
    clouds: "多云",
    snow: "雪天",
    drizzle: "小雨",
    unknown: "未知",
  };

  return labels[condition];
}

function parseGeneratedPlans(
  content: string,
  timeScale: TimeScale,
): GeneratedPlansResponse | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    const normalized = normalizeGeneratedPlans(parsed, timeScale);

    if (!normalized) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

function normalizeGeneratedPlans(
  value: unknown,
  timeScale: TimeScale,
): GeneratedPlansResponse | null {
  if (!isRecord(value)) {
    return null;
  }

  const rawPlans = Array.isArray(value.plans)
    ? value.plans
    : Array.isArray(value.routes)
      ? value.routes
      : Array.isArray(value.options)
        ? value.options
        : [value];
  const kind = getPlanKind(timeScale);
  const plans = rawPlans
    .map((plan, index) =>
      normalizePlan(plan, kind, index === 0 ? "comfort" : "shift", timeScale),
    )
    .filter((plan): plan is GeneratedPlan => plan !== null)
    .slice(0, 2);

  if (plans.length > 0) {
    return { plans };
  }

  const fallbackPlan = createFallbackPlan(kind, timeScale);

  return fallbackPlan ? { plans: [fallbackPlan] } : null;
}

function normalizePlan(
  value: unknown,
  kind: PlanKind,
  fallbackType: PlanType,
  timeScale: TimeScale,
): GeneratedPlan | null {
  if (kind === "weekend") {
    return normalizeWeekendPlan(value, fallbackType);
  }

  if (kind === "longer") {
    return normalizeLongerPlan(value, fallbackType);
  }

  return normalizeLinearPlan(value, fallbackType, timeScale);
}

function normalizeLinearPlan(
  value: unknown,
  fallbackType: PlanType,
  timeScale: TimeScale,
): LinearPlan | null {
  const record = isRecord(value) ? value : {};
  const type = normalizePlanType(record.type, fallbackType);
  const rawModules = Array.isArray(record.modules) ? record.modules : [];
  const fallbackModuleIds = getFallbackModuleIds("linear", type);
  const modules = normalizeModuleList(rawModules, fallbackModuleIds, 4);

  if (modules.length === 0) {
    return null;
  }

  return {
    kind: "linear",
    intro: normalizeIntro(record.intro, type),
    type,
    modules,
    totalDuration: sumModuleDurations(modules),
    timeScale: timeScale === "1hour" ? "1hour" : "tonight",
  };
}

function normalizeWeekendPlan(
  value: unknown,
  fallbackType: PlanType,
): WeekendPlan | null {
  const record = isRecord(value) ? value : {};
  const type = normalizePlanType(record.type, fallbackType);
  const saturdayModules = normalizeModuleList(
    Array.isArray(record.saturdayModules) ? record.saturdayModules : [],
    getFallbackModuleIds("saturday", type),
    5,
  );
  const sundayModules = normalizeModuleList(
    Array.isArray(record.sundayModules) ? record.sundayModules : [],
    getFallbackModuleIds("sunday", type),
    5,
  );

  if (saturdayModules.length === 0 || sundayModules.length === 0) {
    return null;
  }

  return {
    kind: "weekend",
    intro: normalizeIntro(record.intro, type),
    type,
    saturdayModules,
    sundayModules,
    totalDuration:
      sumModuleDurations(saturdayModules) + sumModuleDurations(sundayModules),
    timeScale: "weekend",
  };
}

function normalizeLongerPlan(
  value: unknown,
  fallbackType: PlanType,
): LongerPlan | null {
  const record = isRecord(value) ? value : {};
  const rawAnchors = Array.isArray(record.anchors) ? record.anchors : [];
  const anchors = rawAnchors
    .map(normalizeAnchor)
    .filter((anchor): anchor is Anchor => anchor !== null)
    .slice(0, 5);

  if (anchors.length < 3) {
    for (const fallbackAnchor of createFallbackAnchors()) {
      if (anchors.length >= 3) {
        break;
      }

      if (!anchors.some((anchor) => anchor.moduleId === fallbackAnchor.moduleId)) {
        anchors.push(fallbackAnchor);
      }
    }
  }

  if (anchors.length === 0) {
    return null;
  }

  return {
    kind: "longer",
    theme:
      typeof record.theme === "string" && record.theme.trim()
        ? record.theme.trim().slice(0, 24)
        : "恢复精力周",
    type: normalizePlanType(record.type, fallbackType),
    anchors,
    timeScale: "longer",
  };
}

function normalizeModuleList(
  rawModules: unknown[],
  fallbackModuleIds: string[],
  maxCount: number,
) {
  const modules = rawModules
    .map(normalizeSelectedModule)
    .filter((module): module is SelectedModule => module !== null);
  const usedModuleIds = new Set(modules.map((module) => module.moduleId));

  for (const moduleId of fallbackModuleIds) {
    if (modules.length >= Math.min(3, maxCount)) {
      break;
    }

    if (!usedModuleIds.has(moduleId)) {
      modules.push({ moduleId });
      usedModuleIds.add(moduleId);
    }
  }

  return modules.slice(0, maxCount);
}

function normalizeSelectedModule(value: unknown): SelectedModule | null {
  if (typeof value === "string") {
    const moduleId = resolveModuleId(value);

    return moduleId ? { moduleId } : null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const rawModuleId =
    typeof value.moduleId === "string"
      ? value.moduleId
      : typeof value.id === "string"
        ? value.id
        : typeof value.name === "string"
          ? value.name
          : "";
  const moduleId = resolveModuleId(rawModuleId);

  if (!moduleId) {
    return null;
  }

  return {
    moduleId,
    ...(typeof value.customContext === "string" && value.customContext.trim()
      ? { customContext: value.customContext.trim() }
      : {}),
  };
}

function normalizeAnchor(value: unknown): Anchor | null {
  if (!isRecord(value)) {
    return null;
  }

  const selectedModule = normalizeSelectedModule(value);

  if (!selectedModule) {
    return null;
  }

  return {
    ...selectedModule,
    day:
      typeof value.day === "number" && Number.isFinite(value.day)
        ? Math.max(1, Math.round(value.day))
        : 1,
  };
}

function resolveModuleId(value: string) {
  const normalizedValue = value.trim();

  if (moduleIdSet.has(normalizedValue)) {
    return normalizedValue;
  }

  const byName = moduleIdByName.get(normalizedValue);

  if (byName) {
    return byName;
  }

  const fuzzyModule = moduleLibrary.find(
    (module) =>
      normalizedValue.includes(module.name) ||
      module.name.includes(normalizedValue),
  );

  return fuzzyModule?.id ?? null;
}

function sumModuleDurations(modules: SelectedModule[]) {
  return modules.reduce((total, selectedModule) => {
    const moduleDefinition = moduleById.get(selectedModule.moduleId);

    return total + (moduleDefinition?.duration ?? 0);
  }, 0);
}

function normalizeIntro(value: unknown, type: PlanType) {
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, 18);
  }

  return type === "comfort" ? "先慢下来" : "换个方向";
}

function normalizePlanType(value: unknown, fallbackType: PlanType): PlanType {
  return value === "comfort" || value === "shift" ? value : fallbackType;
}

function createFallbackPlan(
  kind: PlanKind,
  timeScale: TimeScale,
): GeneratedPlan | null {
  if (kind === "weekend") {
    return normalizeWeekendPlan({}, "comfort");
  }

  if (kind === "longer") {
    return normalizeLongerPlan({}, "comfort");
  }

  return normalizeLinearPlan({}, "comfort", timeScale);
}

function createFallbackAnchors(): Anchor[] {
  return [
    { day: 1, moduleId: "mod_slow_cooking", customContext: "先做一顿慢一点的饭" },
    { day: 3, moduleId: "mod_one_block_walk", customContext: "出门绕一个短圈" },
    { day: 6, moduleId: "mod_three_line_journal", customContext: "写下这周三个变化" },
  ].filter((anchor) => moduleIdSet.has(anchor.moduleId));
}

function getFallbackModuleIds(kind: "linear" | "saturday" | "sunday", type: PlanType) {
  if (kind === "saturday") {
    return type === "comfort"
      ? ["mod_grocery_walk", "mod_park_loop", "mod_tea_and_snack"]
      : ["mod_one_block_walk", "mod_market_salad", "mod_light_one_corner"];
  }

  if (kind === "sunday") {
    return type === "comfort"
      ? ["mod_hot_bath", "mod_bed_reset", "mod_three_line_journal"]
      : ["mod_desk_clear", "mod_simple_noodle", "mod_tomorrow_note"];
  }

  return type === "comfort"
    ? ["mod_drink_water_reset", "mod_hot_bath", "mod_three_line_journal"]
    : ["mod_one_block_walk", "mod_tea_station", "mod_sleep_boundary"];
}

function getPlanKind(timeScale: TimeScale): PlanKind {
  if (timeScale === "weekend") {
    return "weekend";
  }

  if (timeScale === "longer") {
    return "longer";
  }

  return "linear";
}

function buildTranslation(plans: GeneratedPlan[], timeScale: TimeScale) {
  const firstPlan = plans[0];

  if (!firstPlan) {
    return timeScale === "longer" ? "一个生活主题" : "今晚先开始";
  }

  return firstPlan.kind === "longer" ? firstPlan.theme : firstPlan.intro;
}

function normalizeScale(value: unknown): SupportedScale {
  if (value === "weekend" || value === "meal") {
    return value;
  }

  return "tonight";
}

function normalizeTimeScale(value: unknown): TimeScale {
  if (
    value === "1hour" ||
    value === "tonight" ||
    value === "weekend" ||
    value === "longer"
  ) {
    return value;
  }

  return "tonight";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMissingScaleColumnError(error: unknown) {
  if (!isRecord(error)) {
    return false;
  }

  return (
    error.code === "PGRST204" ||
    (typeof error.message === "string" &&
      error.message.toLowerCase().includes("scale"))
  );
}
