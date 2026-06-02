import OpenAI from "openai";
import { NextResponse } from "next/server";
import { moduleLibrary, type LifeModule } from "@/lib/moduleLibrary";
import { getUserHistory } from "@/lib/userHistory";

type ExpandModuleBody = {
  moduleId?: unknown;
  anonymousId?: unknown;
};

type ExpandModuleContent = {
  starter: string;
  sensoryHooks: string[];
  avoid: string;
  detailedSteps: string[];
  variation: string;
};

const moduleById = new Map(moduleLibrary.map((module) => [module.id, module]));

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ExpandModuleBody;
    const moduleId =
      typeof body.moduleId === "string" ? body.moduleId.trim() : "";
    const anonymousId =
      typeof body.anonymousId === "string" ? body.anonymousId.trim() : "";

    if (!moduleId || !anonymousId) {
      return NextResponse.json(
        { error: "moduleId 和 anonymousId 不能为空" },
        { status: 400 },
      );
    }

    const selectedModule = moduleById.get(moduleId);

    if (!selectedModule) {
      return NextResponse.json(
        { error: "模块不存在" },
        { status: 404 },
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

    const history = await getUserHistory(anonymousId);
    const likedModules = history.likedModuleIds
      .map((likedModuleId) => moduleById.get(likedModuleId))
      .filter((module): module is LifeModule => Boolean(module));
    const likedCategories = [
      ...new Set(likedModules.map((module) => module.category)),
    ];
    const likedSameModule = history.likedModuleIds.includes(moduleId);
    const client = new OpenAI({
      apiKey,
      baseURL,
    });
    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: buildSystemPrompt(),
        },
        {
          role: "user",
          content: buildUserPrompt({
            likedCategories,
            likedModuleIds: history.likedModuleIds,
            likedSameModule,
            selectedModule,
          }),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.65,
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "AI 没有返回内容" },
        { status: 502 },
      );
    }

    const expandedContent = parseExpandContent(content, selectedModule);

    if (!expandedContent) {
      console.error("expand-module parse error:", content.slice(0, 1200));
      return NextResponse.json(
        { error: "AI 返回格式不正确，请重试" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      data: expandedContent,
    });
  } catch (error) {
    console.error("expand-module error:", error);
    return NextResponse.json(
      { error: "生成展开内容失败，请稍后重试" },
      { status: 500 },
    );
  }
}

function buildSystemPrompt() {
  return `
你是 state-translator 的模块展开助手。
你只负责把一个生活模块展开成更细、可执行、不过度解释的提示。

输出必须是严格 JSON：
{
  "starter": "启动动作（10秒内）",
  "sensoryHooks": ["感官提示1", "感官提示2"],
  "avoid": "避免事项",
  "detailedSteps": ["步骤1", "步骤2"],
  "variation": "可选变体"
}

要求：
- starter 必须是 10 秒内能做的动作。
- sensoryHooks 返回 1-2 条，具体到声音、温度、光线、手感、气味或身体感受。
- avoid 只写一个明确避免事项。
- detailedSteps 返回 2-4 条，每条都是具体动作，不要文艺修饰。
- variation 是一个低成本替代做法。
- 不要诊断用户，不要使用治疗、疗愈、创伤等词。
- 不要 Markdown，不要代码块，不要额外文字。
`.trim();
}

function buildUserPrompt({
  likedCategories,
  likedModuleIds,
  likedSameModule,
  selectedModule,
}: {
  likedCategories: string[];
  likedModuleIds: string[];
  likedSameModule: boolean;
  selectedModule: LifeModule;
}) {
  return [
    `当前模块：${selectedModule.id} / ${selectedModule.name}`,
    `模块类别：${selectedModule.category}`,
    `模块时长：${selectedModule.duration} 分钟`,
    `模块能量：${selectedModule.energyLevel}`,
    `模块原始步骤：${JSON.stringify(selectedModule.instructions)}`,
    `用户过去喜欢的模块ID：${JSON.stringify(likedModuleIds)}`,
    `用户过去喜欢的模块类别：${JSON.stringify(likedCategories)}`,
    likedSameModule
      ? "历史提示：用户以前觉得这个模块有用，可以在 variation 或 starter 中自然提示“上次这个方式对你有用，这次可以再试一次”。"
      : "",
    "请根据当前模块类别微调内容：food 关注准备和味觉；movement 关注出门门槛和身体节奏；space 关注物品与空间；mind 关注书写、注意力和收束。",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseExpandContent(
  content: string,
  selectedModule: LifeModule,
): ExpandModuleContent | null {
  try {
    const parsed = JSON.parse(content) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    const detailedSteps = normalizeStringArray(parsed.detailedSteps).slice(0, 4);
    const fallbackSteps = selectedModule.instructions.slice(0, 3);

    return {
      starter:
        normalizeString(parsed.starter) ??
        selectedModule.instructions[0] ??
        "先把需要用到的东西拿到手边。",
      sensoryHooks: normalizeStringArray(parsed.sensoryHooks).slice(0, 2),
      avoid:
        normalizeString(parsed.avoid) ??
        "避免一边做一边刷短视频。",
      detailedSteps: detailedSteps.length > 0 ? detailedSteps : fallbackSteps,
      variation:
        normalizeString(parsed.variation) ??
        "如果做不完整，就只做最前面的 5 分钟。",
    };
  } catch {
    return null;
  }
}

function normalizeString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
