import OpenAI from "openai";
import { NextResponse } from "next/server";
import { moduleLibrary } from "@/lib/moduleLibrary";
import { createSupabaseServerClient } from "@/lib/supabaseClient";
import type { GeneratedRouteData, RouteScale } from "@/lib/routeTypes";

type SupportedScale = Extract<RouteScale, "tonight" | "weekend" | "meal">;

type RequestBody = {
  inputText?: unknown;
  anonymousId?: unknown;
  regenerate?: unknown;
  scale?: unknown;
  constraints?: {
    time?: unknown;
    budget?: unknown;
    social?: unknown;
  };
};

type ModuleRoute = {
  intro: string;
  modules: Array<{
    moduleId: string;
    customContext?: string;
  }>;
  transitions: string[];
  totalDuration: number;
  type: "comfort" | "shift";
};

type GeneratedRoutesResponse = {
  routes: [ModuleRoute, ModuleRoute];
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

const BASE_PROMPT = `
你是 state-translator 的路线编排器。
用户会输入一个今晚/周末/一顿饭相关的模糊状态，以及时间、预算、社交约束。

你的任务不是生成具体步骤。
具体步骤已经存在于模块库中，你只能从模块库中选择模块、排序，并为模块之间写过渡。

你要输出两条路线：
- comfort：顺着此刻，让用户先稳定下来。
- shift：轻轻掰一下，让用户做一点低压力的对冲。

路线要有节奏感：起步要容易，中段要有一点变化，收尾要能落地。
不要诊断用户，不要使用治疗、疗愈、创伤等词。
不要输出文艺散文，不要写模块步骤。
`.trim();

const SCALE_PROMPTS: Record<SupportedScale, string> = {
  tonight: `
scale = tonight。
路线应该适合今晚开始，优先选择 3-5 个总时长不夸张的模块。
如果 time 是“1小时”，totalDuration 尽量不超过 60。
如果 social 是 Alone，避免强社交模块；Someone 可以包含一条轻联系；Open 可以保留可约人的余地。
`.trim(),
  weekend: `
scale = weekend。
路线应该像一个轻量周末安排，可以选择 4-5 个模块。
模块顺序要能跨半天到两天展开，但不要安排复杂旅行。
如果预算低，优先选择 space、mind、movement 中的低成本模块。
`.trim(),
  meal: `
scale = meal。
路线应该围绕一顿饭展开，必须至少选择 2 个 food 模块。
可以搭配一个 space 模块作为餐桌或厨房准备，也可以用一个 mind 模块收尾。
不要生成菜谱步骤，只选择已有 food 模块。
`.trim(),
};

const OUTPUT_PROMPT = `
可用模块如下，每行格式为：moduleId | name | category | duration | energyLevel
${MODULE_CATALOG}

严格只返回 JSON，不要 Markdown，不要代码块，不要额外解释。

JSON 结构必须严格如下：
{
  "routes": [
    {
      "intro": string,
      "modules": [
        {
          "moduleId": string,
          "customContext": string
        }
      ],
      "transitions": string[],
      "totalDuration": number,
      "type": "comfort"
    },
    {
      "intro": string,
      "modules": [
        {
          "moduleId": string,
          "customContext": string
        }
      ],
      "transitions": string[],
      "totalDuration": number,
      "type": "shift"
    }
  ]
}

硬性要求：
- routes 必须恰好 2 条，一条 type 为 comfort，一条 type 为 shift。
- intro 是一句话定调，不超过 15 个中文字符。
- 每条路线选择 3-5 个模块。
- moduleId 必须来自上面的模块库，不允许编造。
- customContext 可选，用来说明这个模块如何贴合用户当前状态；不要写步骤。
- transitions 长度必须等于 modules.length - 1。
- transitions 每条不超过 24 个中文字符，要简短、具体、有画面感。
- totalDuration 必须等于所选模块 duration 之和。
- 不要生成 instructions、timeline、firstStep 或任何具体操作步骤。
`.trim();

function buildSystemPrompt(scale: SupportedScale) {
  return [BASE_PROMPT, SCALE_PROMPTS[scale], OUTPUT_PROMPT].join("\n\n");
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
    const regenerate = body.regenerate === true;
    const scale = normalizeScale(body.scale);

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

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(scale),
        },
        {
          role: "user",
          content: JSON.stringify({
            inputText,
            constraints: { time, budget, social },
            scale,
            regenerate,
            instruction: regenerate
              ? "这是用户点击“换两个看看”的重新生成请求，请选择不同模块组合，避免与上一组过于相似。"
              : undefined,
          }),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "AI 没有返回内容" },
        { status: 502 },
      );
    }

    const data = parseGeneratedRoutes(content, scale);

    if (!data) {
      console.error("AI module route parse error:", content.slice(0, 1200));
      return NextResponse.json(
        { error: "AI 返回格式不正确，请重试" },
        { status: 502 },
      );
    }

    const supabase = createSupabaseServerClient();
    const { data: insertedRoute, error: insertError } = await supabase
      .from("generated_routes")
      .insert({
        anonymous_id: anonymousId,
        user_input: inputText,
        constraints: { time, budget, social },
        scale,
        translation: buildTranslation(data.routes),
        options: data.routes,
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
      translation: buildTranslation(data.routes),
      options: data.routes as unknown as GeneratedRouteData["options"],
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

function parseGeneratedRoutes(
  content: string,
  scale: SupportedScale,
): GeneratedRoutesResponse | null {
  try {
    const parsed = JSON.parse(content) as unknown;

    const normalized = normalizeGeneratedRoutes(parsed, scale);

    if (!normalized) {
      return null;
    }

    return normalized;
  } catch {
    return null;
  }
}

function normalizeGeneratedRoutes(
  value: unknown,
  scale: SupportedScale,
): GeneratedRoutesResponse | null {
  if (!isRecord(value)) {
    return null;
  }

  const rawRoutes = Array.isArray(value.routes)
    ? value.routes
    : Array.isArray(value.options)
      ? value.options
      : [];

  const normalizedRoutes = rawRoutes
    .map((route, index) =>
      normalizeModuleRoute(
        route,
        index === 0 ? "comfort" : "shift",
        scale,
      ),
    )
    .filter((route): route is ModuleRoute => route !== null);

  const comfortRoute =
    normalizedRoutes.find((route) => route.type === "comfort") ??
    normalizeModuleRoute(null, "comfort", scale);
  const shiftRoute =
    normalizedRoutes.find((route) => route.type === "shift") ??
    normalizeModuleRoute(null, "shift", scale);

  if (!comfortRoute || !shiftRoute) {
    return null;
  }

  return {
    routes: [comfortRoute, shiftRoute],
  };
}

function normalizeModuleRoute(
  value: unknown,
  fallbackType: ModuleRoute["type"],
  scale: SupportedScale,
): ModuleRoute | null {
  const route = isRecord(value) ? value : {};
  const routeType =
    route.type === "comfort" || route.type === "shift"
      ? route.type
      : fallbackType;
  const rawModules = Array.isArray(route.modules) ? route.modules : [];
  const fallbackModuleIds = getFallbackModuleIds(scale, routeType);
  const normalizedModules = rawModules
    .map(normalizeSelectedModule)
    .filter((module): module is ModuleRoute["modules"][number] => module !== null);
  const usedModuleIds = new Set(normalizedModules.map((module) => module.moduleId));

  for (const moduleId of fallbackModuleIds) {
    if (normalizedModules.length >= 3) {
      break;
    }

    if (!usedModuleIds.has(moduleId)) {
      normalizedModules.push({ moduleId });
      usedModuleIds.add(moduleId);
    }
  }

  if (normalizedModules.length === 0) {
    return null;
  }

  const modules = normalizedModules.slice(0, 5);
  const rawTransitions = Array.isArray(route.transitions) ? route.transitions : [];
  const transitions = normalizeTransitions(rawTransitions, modules);
  const totalDuration = modules.reduce((total, selectedModule) => {
    const moduleDefinition = moduleById.get(selectedModule.moduleId);

    return total + (moduleDefinition?.duration ?? 0);
  }, 0);

  return {
    intro: normalizeIntro(route.intro, routeType),
    modules,
    transitions,
    totalDuration,
    type: routeType,
  };
}

function normalizeSelectedModule(
  value: unknown,
): ModuleRoute["modules"][number] | null {
  if (!isRecord(value)) {
    if (typeof value === "string") {
      const moduleId = resolveModuleId(value);

      return moduleId ? { moduleId } : null;
    }

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

function normalizeTransitions(
  rawTransitions: unknown[],
  modules: ModuleRoute["modules"],
) {
  const transitions = rawTransitions
    .filter((transition): transition is string => typeof transition === "string")
    .map((transition) => transition.trim())
    .filter(Boolean)
    .slice(0, Math.max(0, modules.length - 1));

  while (transitions.length < modules.length - 1) {
    const nextModule = moduleById.get(modules[transitions.length + 1].moduleId);
    transitions.push(`然后转到${nextModule?.name ?? "下一件事"}`);
  }

  return transitions;
}

function normalizeIntro(value: unknown, type: ModuleRoute["type"]) {
  if (typeof value === "string" && value.trim()) {
    return value.trim().slice(0, 18);
  }

  return type === "comfort" ? "先从简单处开始" : "轻轻换一个方向";
}

function getFallbackModuleIds(
  scale: SupportedScale,
  type: ModuleRoute["type"],
) {
  if (scale === "meal") {
    return type === "comfort"
      ? ["mod_warm_milk", "mod_simple_noodle", "mod_tea_and_snack"]
      : ["mod_grocery_walk", "mod_one_pan_dinner", "mod_desk_clear"];
  }

  if (scale === "weekend") {
    return type === "comfort"
      ? ["mod_bed_reset", "mod_park_loop", "mod_three_line_journal"]
      : ["mod_grocery_errand", "mod_light_one_corner", "mod_tomorrow_note"];
  }

  return type === "comfort"
    ? ["mod_drink_water_reset", "mod_hot_bath", "mod_three_line_journal"]
    : ["mod_one_block_walk", "mod_tea_station", "mod_sleep_boundary"];
}

function buildTranslation(routes: [ModuleRoute, ModuleRoute]) {
  const comfortRoute = routes.find((route) => route.type === "comfort");

  return comfortRoute?.intro ?? routes[0].intro;
}

function normalizeScale(value: unknown): SupportedScale {
  if (value === "weekend" || value === "meal") {
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

  const message =
    typeof error.message === "string" ? error.message.toLowerCase() : "";
  const details =
    typeof error.details === "string" ? error.details.toLowerCase() : "";

  return (
    (message.includes("scale") || details.includes("scale")) &&
    (message.includes("column") ||
      details.includes("column") ||
      message.includes("schema cache") ||
      details.includes("schema cache"))
  );
}
