import OpenAI from "openai";
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabaseClient";
import type { GeneratedRouteData, OptionId } from "@/lib/routeTypes";

type RequestBody = {
  inputText?: unknown;
  anonymousId?: unknown;
  regenerate?: unknown;
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
  translation: string;
  options: [GeneratedOption, GeneratedOption];
};

const SYSTEM_PROMPT = `
你是一个“状态翻译器”产品中的路线生成器。你的任务是把用户说不清的当下状态，翻译成两条具体、可执行、低压力的生活路线。

必须只返回合法 JSON，不要 Markdown，不要代码块，不要解释文字。

JSON 结构必须严格如下：
{
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
- title 6 个中文字符以内。
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
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: JSON.stringify({
            inputText,
            constraints: { time, budget },
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

    const supabase = createSupabaseServerClient();
    const { data: insertedRoute, error: insertError } = await supabase
      .from("generated_routes")
      .insert({
        anonymous_id: anonymousId,
        user_input: inputText,
        constraints: { time, budget },
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
