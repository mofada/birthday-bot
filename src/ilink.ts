import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { requireEnv } from "./env";
import type { ILinkGetUpdatesResponse, ILinkMessage } from "./types";

const BASE = "https://ilinkai.weixin.qq.com";
const CHANNEL_VERSION = "0.1.0";
const GET_UPDATES_TIMEOUT_MS = 5_000;
// 运行时状态用于跨次执行复用 context_token/get_updates_buf。
const RUNTIME_FILE = ".runtime/state.json";

interface RuntimeState {
  contextToken?: string;
  getUpdatesBuf?: string;
  updatedAt?: string;
}

function generateWechatUin() {
  const randomUint32 = Math.floor(Math.random() * 0xffffffff);
  return Buffer.from(String(randomUint32)).toString("base64");
}

function generateClientId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeJsonParse(text: string) {
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isTimeoutError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: string }).name === "TimeoutError"
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

function getHeaders(token: string) {
  // iLink 对请求头较敏感：AuthorizationType / X-WECHAT-UIN / App-ClientVersion 缺失时，
  // 可能出现 HTTP 200 但消息无法稳定投递。
  return {
    Authorization: `Bearer ${token}`,
    AuthorizationType: "ilink_bot_token",
    "Content-Type": "application/json",
    "X-WECHAT-UIN": generateWechatUin(),
    "iLink-App-Id": "",
    "iLink-App-ClientVersion": "0",
  };
}

function pickLatestContextMessage(msgs: ILinkMessage[], toUserId: string) {
  // 只取目标用户最近的一条文本消息，避免历史消息里的旧 context_token 污染会话。
  return msgs
    .filter((msg) => {
      return (
        msg.message_type === 1 &&
        msg.from_user_id === toUserId &&
        msg.context_token
      );
    })
    .sort((a, b) => {
      return (b.create_time_ms ?? 0) - (a.create_time_ms ?? 0);
    })[0];
}

async function readRuntimeState(): Promise<RuntimeState> {
  try {
    const file = Bun.file(RUNTIME_FILE);

    if (!(await file.exists())) return {};

    return (await file.json()) as RuntimeState;
  } catch {
    return {};
  }
}

async function writeRuntimeState(state: RuntimeState) {
  // 先确保目录存在，避免首次运行写文件失败。
  await mkdir(dirname(RUNTIME_FILE), { recursive: true });
  await Bun.write(RUNTIME_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

export async function fetchLatestContextToken() {
  const token = requireEnv("ILINK_TOKEN");
  const toUserId = requireEnv("TO_USER_ID");
  const runtimeState = await readRuntimeState();

  // 优先使用缓存状态，其次回退到环境变量中的初始 token。
  // context_token 不是永久有效，必须持续刷新和回退。
  const oldContextToken = runtimeState.contextToken || process.env.CONTEXT_TOKEN;
  // get_updates_buf 是增量游标；每次从空值开始会重复读历史消息。
  const getUpdatesBuf = runtimeState.getUpdatesBuf || "";

  const headers = getHeaders(token);

  try {
    console.log("========== 尝试获取最新 context_token ==========");

    const resp = (await fetch(`${BASE}/ilink/bot/getupdates`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        get_updates_buf: getUpdatesBuf,
        base_info: {
          channel_version: CHANNEL_VERSION,
        },
      }),
      signal: AbortSignal.timeout(GET_UPDATES_TIMEOUT_MS),
    }).then((r) => r.json())) as ILinkGetUpdatesResponse;

    console.log("getupdates 返回:");
    console.log(JSON.stringify(resp, null, 2));

    const msgs = resp.msgs ?? [];
    const latestMsg = pickLatestContextMessage(msgs, toUserId);
    const latestContextToken = latestMsg?.context_token || oldContextToken;
    const latestGetUpdatesBuf = resp.get_updates_buf || getUpdatesBuf;

    // 无论是否有新消息，都更新游标与最近可用 token，保证下次增量拉取连续。
    await writeRuntimeState({
      contextToken: latestContextToken,
      getUpdatesBuf: latestGetUpdatesBuf,
      updatedAt: new Date().toISOString(),
    });

    if (!latestContextToken) {
      throw new Error("没有可用的 CONTEXT_TOKEN，请先给 Bot 发一条消息并初始化");
    }

    if (!latestMsg?.context_token) {
      console.log("没有新消息，继续使用缓存/Secrets 中的 context_token");
      return latestContextToken;
    }

    console.log("✅ 获取到新的 context_token，已写入 cache state");
    return latestContextToken;
  } catch (error: unknown) {
    if (isTimeoutError(error)) {
      console.log("getupdates 超时，使用缓存/Secrets 中的 context_token");
    } else {
      console.log("getupdates 失败，使用缓存/Secrets 中的 context_token");
      console.log(getErrorMessage(error));
    }

    // 没有任何可用 token 时直接失败，提示用户先做一次绑定初始化。
    if (!oldContextToken) {
      throw new Error("没有可用的 CONTEXT_TOKEN，请先给 Bot 发一条消息并初始化");
    }

    return oldContextToken;
  }
}

export async function sendToWechat(text: string, contextToken: string) {
  const token = requireEnv("ILINK_TOKEN");
  const toUserId = requireEnv("TO_USER_ID");
  if (!contextToken) throw new Error("缺少 CONTEXT_TOKEN");

  const body = {
    msg: {
      from_user_id: "",
      to_user_id: toUserId,
      client_id: generateClientId(),
      message_type: 2,
      message_state: 2,
      context_token: contextToken,
      item_list: [
        {
          type: 1,
          text_item: {
            text,
          },
        },
      ],
    },
    base_info: {
      channel_version: CHANNEL_VERSION,
    },
  };

  const bodyText = JSON.stringify(body);

  const headers = {
    ...getHeaders(token),
    "Content-Length": String(Buffer.byteLength(bodyText, "utf-8")),
  };

  console.log("========== 开始发送微信消息 ==========");
  console.log("发送对象:", toUserId);
  console.log("是否带 context_token:", Boolean(contextToken));
  console.log("client_id:", body.msg.client_id);
  console.log("发送内容:\n");
  console.log(text);
  console.log("====================================");

  const response = await fetch(`${BASE}/ilink/bot/sendmessage`, {
    method: "POST",
    headers,
    body: bodyText,
  });

  const rawText = await response.text();
  const result = safeJsonParse(rawText);

  console.log("HTTP Status:", response.status);
  console.log("原始返回:", rawText || "{}");

  // HTTP 200 仅表示接口调用成功；真正的投递结果仍需看 ret 字段。
  if (!response.ok) {
    throw new Error(`微信消息发送失败：HTTP ${response.status}`);
  }

  if (typeof result === "object" && result !== null) {
    const ret = (result as any).ret;

    // ret=-2 常见于 context_token/会话失效，是最常见的投递失败原因。
    if (ret === -2) {
      throw new Error("微信投递失败：context_token 可能已失效");
    }

    if (ret !== undefined && ret !== 0) {
      throw new Error(`微信投递失败：ret=${ret}`);
    }
  }

  console.log("✅ 微信消息发送成功");
  return result;
}
