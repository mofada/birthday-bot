import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";
import { Solar } from "lunar-typescript";
import type { FamilyMember } from "./types";

const APP_TIMEZONE = "Asia/Shanghai";

dayjs.extend(utc);
dayjs.extend(timezone);

function nowInAppTimezone() {
  // 所有日期判断统一按东八区，避免 CI 环境默认 UTC 导致日期偏移。
  return dayjs().tz(APP_TIMEZONE);
}

export function getTodayBirthdayPeople(list: FamilyMember[]) {
  // 统一按东八区计算“今天”，避免运行环境时区差异造成日期偏差。
  const today = nowInAppTimezone();

  const solarMonth = today.month() + 1;
  const solarDay = today.date();

  const lunar = Solar.fromYmd(today.year(), solarMonth, solarDay).getLunar();
  const lunarMonth = lunar.getMonth();
  const lunarDay = lunar.getDay();

  return list.filter((person) => {
    if (person.birthdayType === "solar") {
      return person.birthMonth === solarMonth && person.birthDay === solarDay;
    }

    return person.birthMonth === lunarMonth && person.birthDay === lunarDay;
  });
}

export function getAge(year: number | null) {
  if (!year) return null;
  return nowInAppTimezone().year() - year;
}

export function generatePrompt(people: FamilyMember[]) {
  // 使用结构化输入让模型稳定识别每位成员信息。
  const peopleText = people
    .map((person, index) => {
      const age = getAge(person.birthYear);
      const genderText = person.gender === "male" ? "男" : "女";
      const ageText = age === null ? "未知" : `${age}岁`;

      return `${index + 1}. 姓名：${person.name} | 称呼：${person.relation} | 性别：${genderText} | 年龄：${ageText}`;
    })
    .join("\n\n");

  return `
请模仿中国家庭微信群生日祝福风格生成文案。

要求：

- 温馨自然
- 不要太正式
- 不要 AI 味
- 适合发亲戚群
- 带 emoji
- 可以带微信表情，例如：[蛋糕][庆祝][玫瑰]
- 不同年龄层语气不同
- 一个人生成一段
- 不要太长
- 风格参考中国家庭微信群

今天生日的人：

${peopleText}
`.trim();
}

function renderBirthdayPeopleLines(todayPeople: FamilyMember[]) {
  // 统一列表渲染，避免“有 AI/无 AI”两条路径的展示差异。
  return todayPeople.map((p) => {
    const age = getAge(p.birthYear);
    return `- ${p.relation}${p.name}${age === null ? "" : `（${age}岁）`}`;
  });
}

export function buildBirthdayMessage(todayPeople: FamilyMember[]) {
  const prompt = generatePrompt(todayPeople);

  return [
    "🎂 今日生日提醒",
    "",
    "今天生日：",
    ...renderBirthdayPeopleLines(todayPeople),
    "",
    "====================",
    "",
    "下面内容复制给 AI：",
    "",
    prompt,
  ].join("\n");
}

export function buildBirthdayMessageWithAi(
  todayPeople: FamilyMember[],
  aiText: string,
) {
  return [
    "🎂 今日生日提醒",
    "",
    "今天生日：",
    ...renderBirthdayPeopleLines(todayPeople),
    "",
    "====================",
    "",
    "AI 生成祝福：",
    "",
    aiText.trim(),
  ].join("\n");
}
