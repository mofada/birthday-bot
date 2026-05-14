import OpenAI from "openai";

function getAiKey() {
  // 同时兼容 AI_API_KEY 与 OPENAI_API_KEY 两种命名。
  return process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
}

function getAiBaseUrl() {
  const configured =
    process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || "";
  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  // 默认走 DeepSeek 兼容接口，用户也可通过 AI_BASE_URL 覆盖。
  return "https://api.deepseek.com/v1";
}

function getAiModel() {
  const configured = process.env.AI_MODEL || process.env.OPENAI_MODEL;
  if (configured) return configured;

  return "deepseek-chat";
}

export function hasAiConfig() {
  return Boolean(getAiKey());
}

export async function generateTextByAi(prompt: string) {
  const apiKey = getAiKey();
  if (!apiKey) {
    return null;
  }

  const baseUrl = getAiBaseUrl();
  const model = getAiModel();

  try {
    const client = new OpenAI({
      apiKey,
      baseURL: baseUrl,
      timeout: 20_000,
    });

    const result = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content: "你是一个中国家庭微信群文案助手，输出自然、温暖、无AI味的中文生日祝福。",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.8,
    });

    const content = result.choices?.[0]?.message?.content?.trim();

    if (!content) {
      console.log("AI 返回为空，回退为手动 prompt 模式");
      return null;
    }

    return content;
  } catch (error: unknown) {
    // 任何异常都回退到手动模式，保证消息链路不中断。
    console.log("AI 调用异常，回退为手动 prompt 模式");
    if (error instanceof Error) {
      console.log(error.message);
    } else {
      console.log(String(error));
    }
    return null;
  }
}
