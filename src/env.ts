export function requireEnv(name: "ILINK_TOKEN" | "TO_USER_ID") {
  // 启动即做必填校验，避免请求阶段才出现隐蔽错误。
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少 ${name}`);
  }
  return value;
}
