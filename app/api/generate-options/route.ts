import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseClient";
import type { GeneratedRouteData, OptionId, RouteScale } from "@/lib/routeTypes";

type RequestBody = {
  inputText?: unknown;
  anonymousId?: unknown;
  regenerate?: unknown;
  scale?: unknown;
  constraints?: {
    time?: unknown;
    budget?: unknown;
  };
};

type GeneratedFirstStep = {
  time: string;
  action: string;
  environment: string;
  surprise: string;
};

type GeneratedStep = {
  time: string;
  action: string;
  environment: string;
  tip?: string;
};

type GeneratedOption = {
  id: OptionId;
  title: string;
  reason: string;
  preview: string;
  firstStep: GeneratedFirstStep;
  followingSteps: string[];
  timeline: GeneratedStep[];
};

type GeneratedOptionsResponse = {
  detected_scale?: Exclude<RouteScale, "auto">;
  translation: string;
  options: [GeneratedOption, GeneratedOption];
};

const BASE_PERSONA_PROMPT = `
你是一个“状态翻译器”产品中的路线生成器。你的任务是把用户说不清的当下状态，翻译成两条具体、可执行、低压力的生活路线。
你的语气像一个敏感、克制、会观察现实细节的朋友：先反射式倾听，再给出具体安排。
不要做医疗诊断，不要制造焦虑，不要输出心理鸡汤，不要给宏大空泛建议。
每条路线都要照顾用户当下精力，动作要真实可做，预算和时间约束必须优先。
`.trim();

const SCALE_INSTRUCTIONS: Record<Exclude<RouteScale, "auto">, string> = {
  tonight: `
尺度：今晚。
生成单次出行、居家体验或短时生活路线。timeline 必须是 3-5 步，适合从今天或今晚开始。
每一步用具体时间点或时间段表达，例如“傍晚6点左右”“睡前20分钟”。
`.trim(),
  weekend: `
尺度：周末。
生成 2 天的周末路线。timeline 必须是 4-5 步，尽量覆盖第1天上午/下午/晚上和第2天上午/下午。
time 字段要明确写出“第1天上午”“第1天下午”“第2天上午”等。
`.trim(),
  travel: `
尺度：旅行。
生成 2-3 天的轻旅行方案，包含交通方式、主要体验和节奏安排，但不要指定具体酒店。
timeline 必须是 4-5 步，time 字段要明确写出“第1天”“第2天”“第3天”等，environment 写交通或场景。
`.trim(),
  meal: `
尺度：一顿饭。
生成完整菜谱或吃饭方案。必须包含超市可买到的食材、烹饪时间、步骤和小贴士。
firstStep.environment 必须以“食材：”开头列出食材，用顿号分隔。timeline 是 3-5 个烹饪或用餐步骤。
`.trim(),
  book: `
尺度：一本书。
推荐一本符合用户状态的书。title 尽量使用书名，可以超过 6 个字但要简短。
firstStep.environment 必须包含“作者：作者名”。preview 写一句具体推荐理由，timeline 写 3-5 个阅读建议、第一章进入方式或读后行动。
`.trim(),
  corner: `
尺度：一个角落。
设计一个家中或城市里的角落改造/布置方案。包含物品清单、步骤和氛围描述。
firstStep.environment 必须以“物品：”开头列出物品，用顿号分隔。timeline 是 3-5 个布置、整理或体验步骤。
`.trim(),
};

const OUTPUT_FORMAT_PROMPT = `
必须只返回合法 JSON，不要 Markdown，不要代码块，不要解释文字。

JSON 结构必须严格如下：
{
  "detected_scale": "tonight" | "weekend" | "travel" | "meal" | "book" | "corner",
  "translation": string,
  "options": [
    {
      "id": "A",
      "title": string,
      "reason": string,
      "preview": string,
      "firstStep": {
        "time": string,
        "action": string,
        "environment": string,
        "surprise": string
      },
      "followingSteps": string[],
      "timeline": [
        {
          "time": string,
          "action": string,
          "environment": string,
          "tip": string
        }
      ]
    },
    {
      "id": "B",
      "title": string,
      "reason": string,
      "preview": string,
      "firstStep": {
        "time": string,
        "action": string,
        "environment": string,
        "surprise": string
      },
      "followingSteps": string[],
      "timeline": [
        {
          "time": string,
          "action": string,
          "environment": string,
          "tip": string
        }
      ]
    }
  ]
}

输出约束：
- translation 是核心翻译句，20 个中文字符以内。
- options 必须恰好 2 个，A 和 B 各一个。
- A 必须是安抚型：顺应状态、降低刺激、帮助用户恢复一点稳定感。
- B 必须是微突破型：轻度对冲当前状态，但不能要求高能量、高社交或高消费。
- title 通常 6 个中文字符以内；如果尺度是“一本书”，title 可以使用书名但仍要简洁。
- reason 20 个中文字符左右，说明为什么适配。
- preview 是一句路线预览，必须具体。
- firstStep 必须是免费可试的第一步，马上能做。
- firstStep.surprise 必须是一个具体、可感知的微小惊喜，描述用户执行第一步时可能注意到的细节；必须落在真实生活场景中，可看见、听见、闻到或触摸到，避免抽象情绪词。例如：“第二个路口的便利店冰柜会有一排蓝色小灯”。
- followingSteps 必须是 2-3 条字符串，描述后续锁定步骤的方向。
- followingSteps 每条尽量以前 5-10 个字形成清晰关键词，方便前端截取成模糊预览标题。
- timeline 必须是 3-5 步，包含 firstStep 对应内容或自然承接它。
- 每一步都要具体、可执行，包含时间、动作、环境；tip 可短。
- 严格遵守用户给出的时间和预算约束。
- 避免文艺空泛、心理鸡汤、宏大建议、医疗诊断。
`.trim();

function buildSystemPrompt(scale: RouteScale) {
  const scalePrompt =
    scale === "auto"
      ? `
尺度：自动推断。
请根据用户输入在 tonight、weekend、travel、meal、book、corner 中选择最合适的尺度，并在顶层返回 detected_scale。
如果用户明显想要短时安排，选 tonight；想逃离或修复一个周末，选 weekend；涉及城市/目的地/离开原处，选 travel；涉及吃什么或做饭，选 meal；涉及阅读、精神陪伴，选 book；涉及房间、桌面、窗边、街角等空间，选 corner。
`.trim()
      : SCALE_INSTRUCTIONS[scale];

  return [BASE_PERSONA_PROMPT, scalePrompt, OUTPUT_FORMAT_PROMPT].join("\n\n");
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
        ? body.constraints.time
        : "";
    const budget =
      typeof body.constraints?.budget === "string"
        ? body.constraints.budget
        : "";
    const regenerate = body.regenerate === true;
    const requestedScale = normalizeRequestedScale(body.scale);

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
          content: buildSystemPrompt(requestedScale),
        },
        {
          role: "user",
          content: JSON.stringify({
            inputText,
            constraints: { time, budget },
            scale: requestedScale,
            regenerate,
            instruction: regenerate
              ? "这是用户点击“换两个看看”的重新生成请求，请避开过于相似的路线角度。"
              : undefined,
          }),
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.8,
    });

    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: "AI 没有返回内容" },
        { status: 502 },
      );
    }

    const data = parseGeneratedOptions(content);

    if (!data) {
      return NextResponse.json(
        { error: "AI 返回格式不正确，请重试" },
        { status: 502 },
      );
    }

    if (requestedScale === "auto" && !data.detected_scale) {
      return NextResponse.json(
        { error: "AI 未返回 detected_scale，请重试" },
        { status: 502 },
      );
    }

    const resolvedScale =
      requestedScale === "auto"
        ? normalizeResolvedScale(data.detected_scale)
        : requestedScale;

    const supabase = createSupabaseServerClient();
    const { data: insertedRoute, error: insertError } = await supabase
      .from("generated_routes")
      .insert({
        anonymous_id: anonymousId,
        user_input: inputText,
        constraints: { time, budget },
        scale: resolvedScale,
        translation: data.translation,
        options: data.options,
      })
      .select("id")
      .single();

    if (insertError || !insertedRoute) {
      console.error("generated_routes insert error:", insertError);

      return NextResponse.json(
        { error: "保存生成路线失败，请稍后重试" },
        { status: 500 },
      );
    }

    const responseData: GeneratedRouteData = {
      routeId: insertedRoute.id as string,
      scale: resolvedScale,
      translation: data.translation,
      options: data.options,
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

function parseGeneratedOptions(content: string): GeneratedOptionsResponse | null {
  try {
    const parsed = JSON.parse(content) as unknown;

    if (!isGeneratedOptionsResponse(parsed)) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function isGeneratedOptionsResponse(
  value: unknown,
): value is GeneratedOptionsResponse {
  if (!isRecord(value) || typeof value.translation !== "string") {
    return false;
  }

  if (
    value.detected_scale !== undefined &&
    !isResolvedRouteScale(value.detected_scale)
  ) {
    return false;
  }

  if (!Array.isArray(value.options) || value.options.length !== 2) {
    return false;
  }

  return (
    isGeneratedOption(value.options[0], "A") &&
    isGeneratedOption(value.options[1], "B")
  );
}

function isGeneratedOption(
  value: unknown,
  expectedId: "A" | "B",
): value is GeneratedOption {
  if (!isRecord(value) || value.id !== expectedId) {
    return false;
  }

  return (
    typeof value.title === "string" &&
    typeof value.reason === "string" &&
    typeof value.preview === "string" &&
    isFirstStep(value.firstStep) &&
    Array.isArray(value.followingSteps) &&
    value.followingSteps.length >= 2 &&
    value.followingSteps.length <= 3 &&
    value.followingSteps.every((step) => typeof step === "string") &&
    Array.isArray(value.timeline) &&
    value.timeline.length >= 3 &&
    value.timeline.length <= 5 &&
    value.timeline.every(isStep)
  );
}

function isFirstStep(value: unknown): value is GeneratedFirstStep {
  return (
    isStepWithoutTip(value) &&
    typeof (value as Record<string, unknown>).surprise === "string"
  );
}

function isStep(value: unknown): value is GeneratedStep {
  if (!isStepWithoutTip(value)) {
    return false;
  }

  const step = value as Record<string, unknown>;

  return step.tip === undefined || typeof step.tip === "string";
}

function isStepWithoutTip(value: unknown): value is Omit<GeneratedStep, "tip"> {
  return (
    isRecord(value) &&
    typeof value.time === "string" &&
    typeof value.action === "string" &&
    typeof value.environment === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeRequestedScale(value: unknown): RouteScale {
  return typeof value === "string" && isRouteScale(value) ? value : "tonight";
}

function normalizeResolvedScale(
  value: GeneratedOptionsResponse["detected_scale"],
): Exclude<RouteScale, "auto"> {
  return value && isResolvedRouteScale(value) ? value : "tonight";
}

function isRouteScale(value: string): value is RouteScale {
  return (
    value === "auto" ||
    value === "tonight" ||
    value === "weekend" ||
    value === "travel" ||
    value === "meal" ||
    value === "book" ||
    value === "corner"
  );
}

function isResolvedRouteScale(value: unknown): value is Exclude<RouteScale, "auto"> {
  return (
    value === "tonight" ||
    value === "weekend" ||
    value === "travel" ||
    value === "meal" ||
    value === "book" ||
    value === "corner"
  );
}
