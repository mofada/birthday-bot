import { generateTextByAi, hasAiConfig } from "./ai";
import {
  buildBirthdayMessage,
  buildBirthdayMessageWithAi,
  generatePrompt,
  getTodayBirthdayPeople,
} from "./birthday";
import { fetchLatestContextToken, sendToWechat } from "./ilink";
import type { FamilyMember } from "./types";

async function loadBirthdays(): Promise<FamilyMember[]> {
  // 优先使用环境变量，方便在 GitHub Actions 里通过 Secret 注入完整 JSON。
  const fromEnv = process.env.BIRTHDAYS_JSON;
  if (fromEnv) {
    try {
      const parsed = JSON.parse(fromEnv) as unknown;
      if (!Array.isArray(parsed)) {
        throw new Error("BIRTHDAYS_JSON 必须是数组");
      }
      return parsed as FamilyMember[];
    } catch (error) {
      throw new Error(
        `BIRTHDAYS_JSON 解析失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // 本地开发默认读取根目录 birthdays.json。
  const file = Bun.file("birthdays.json");
  if (await file.exists()) {
    const parsed = (await file.json()) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("birthdays.json 必须是数组");
    }
    return parsed as FamilyMember[];
  }

  throw new Error(
    "缺少生日数据：请提供 BIRTHDAYS_JSON，或在项目根目录创建 birthdays.json",
  );
}

/**
 * 主流程
 */
async function main() {
  const birthdays = await loadBirthdays();
  const todayPeople = getTodayBirthdayPeople(birthdays as FamilyMember[]);

  if (!todayPeople.length) {
    console.log("今天没有人生日，将发送运行状态消息");
  } else {
    console.log(
      `今天生日的人：${todayPeople
        .map((p) => `${p.relation}${p.name}`)
        .join("、")}`,
    );
  }

  // 每次发送前先刷新 context_token；失败时会回退到缓存/环境变量中的旧值。
  const contextToken = await fetchLatestContextToken();

  let message = [
    "🤖 生日提醒机器人运行正常",
    "",
    "今天没有人生日。",
    "",
    "如果你收到这条消息，说明定时任务和发送链路都正常。",
  ].join("\n");

  if (todayPeople.length > 0) {
    if (hasAiConfig()) {
      const prompt = generatePrompt(todayPeople);
      const aiText = await generateTextByAi(prompt);
      // AI 生成失败时自动回退到手动 prompt 模式，避免当天消息中断。
      message = aiText
        ? buildBirthdayMessageWithAi(todayPeople, aiText)
        : buildBirthdayMessage(todayPeople);
    } else {
      message = buildBirthdayMessage(todayPeople);
    }
  }

  await sendToWechat(message, contextToken);

  console.log("生日提醒发送成功");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
