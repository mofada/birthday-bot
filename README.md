# Birthday Bot

一个用于家庭生日提醒的微信机器人项目。

默认采用开源友好的数据策略：

- 仓库只提交示例数据（`birthdays.example.json`）
- 真实数据不入库（`birthdays.json` 已被 `.gitignore` 忽略）
- GitHub Actions 可通过 `BIRTHDAYS_JSON` Secret 注入真实数据

同时提供两种 Bot 凭证初始化方式：

1. GitHub Pages 可视化配置页（推荐，适合新手）
2. 本地 CLI 脚本（CORS 受限时兜底）

功能概览：

- 按北京时间计算今天是否有人生日（支持阳历和农历）
- 有人生日时发送生日提醒文案
- 没人生日时发送一条“机器人运行正常”的心跳消息
- 每次发送前先调用 getupdates 尝试拿最新 context_token
- 使用 Actions Cache 持久化 runtime state（context_token 与 get_updates_buf）
- 可选：配置 AI Key 后自动生成祝福文案（支持 DeepSeek / 阿里通义兼容接口）
- AI 调用基于 OpenAI SDK，通过 baseURL + model 适配不同厂商

## 项目结构

src 目录按职责拆分：

- [src/index.ts](src/index.ts)：主流程编排
- [src/birthday.ts](src/birthday.ts)：生日计算、文案构建
- [src/ilink.ts](src/ilink.ts)：iLink API 调用、上下文更新、runtime cache 读写
- [src/env.ts](src/env.ts)：环境变量读取
- [src/types.ts](src/types.ts)：类型定义
- [birthdays.example.json](birthdays.example.json)：开源示例数据
- [birthdays.schema.json](birthdays.schema.json)：字段规范（JSON Schema）
- [docs/setup.html](docs/setup.html)：GitHub Pages 可视化初始化页面
- [scripts/get-token.ts](scripts/get-token.ts)：本地 CLI 获取凭证脚本

## 初始化 Bot 凭证

### 方式一：GitHub Pages（可视化）

<p style="color:#d1242f;font-weight:700;">⚠ 当前状态：受 iLink 接口跨域（CORS）限制影响，网页方式目前不可用。</p>
<p style="color:#d1242f;">推荐直接使用下方「方式二：本地 CLI（兜底）」完成初始化。</p>

1. 在仓库 Settings -> Pages 中启用 Pages
2. 选择 Deploy from branch，分支选 `main`，目录选 `docs`
3. 打开页面 `https://你的用户名.github.io/birthday-bot/setup.html`
4. 按页面提示：扫码登录 -> 微信给 Bot 发“绑定我” -> 复制结果

页面会生成：

- ILINK_TOKEN
- TO_USER_ID
- CONTEXT_TOKEN
- BOT_BASE_URL

安全提醒：

- 不要截图或外传这些凭证
- 不要提交到仓库
- 页面只在浏览器内存展示，刷新后清空

### 方式二：本地 CLI（兜底）

如果页面方式被 CORS 拦截，请本地运行：

	bun run get-token

脚本会输出同样的凭证结果，按提示填入 Secrets。

## 本地运行

### 1) 安装依赖

使用 Bun：

	bun install

### 2) 配置环境变量

至少需要以下变量：

- ILINK_TOKEN：iLink Bot Token
- TO_USER_ID：要发送到的用户 ID
- CONTEXT_TOKEN：初始上下文 Token（首次需要先给 Bot 发一条消息拿到）

PowerShell 示例：

	$env:ILINK_TOKEN="xxx"
	$env:TO_USER_ID="xxx"
	$env:CONTEXT_TOKEN="xxx"

### 3) 准备生日数据（本地）

首次使用先复制示例文件：

	cp birthdays.example.json birthdays.json

然后编辑 `birthdays.json` 填入你自己的真实数据。

### 4) 运行

	bun run start

## GitHub Actions 自动运行

定时任务文件：

- [.github/workflows/birthday.yml](.github/workflows/birthday.yml)

当前配置：

- 每天北京时间 08:30 运行（cron 使用 UTC 表达）
- Job 环境变量设置为 Asia/Shanghai
- 使用 Actions Cache 保存 .runtime/state.json

## 必要的 GitHub Secrets

请在仓库中配置：

- ILINK_TOKEN
- TO_USER_ID
- CONTEXT_TOKEN

可选（推荐用于 Actions 注入真实生日数据）：

- BIRTHDAYS_JSON

说明：

- 若配置了 `BIRTHDAYS_JSON`，程序优先使用该 Secret 的 JSON 内容
- 若未配置 `BIRTHDAYS_JSON`，程序会读取仓库根目录的 `birthdays.json`

可选（用于配置页/脚本输出的 base 地址，通常可不填）：

- BOT_BASE_URL

可选（开启自动 AI 生成时使用）：

- AI_API_KEY
- AI_BASE_URL（可选，默认 https://api.deepseek.com/v1）
- AI_MODEL（可选，默认 deepseek-chat）

示例：

- DeepSeek：
	- AI_API_KEY=你的 deepseek key
	- AI_BASE_URL=https://api.deepseek.com/v1（可选）
	- AI_MODEL=deepseek-chat（可选）
- 阿里通义：
	- AI_API_KEY=你的 dashscope key
	- AI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
	- AI_MODEL=qwen-plus（可选）

## 运行时 Token 更新机制

流程如下：

1. 启动后先调用 getupdates（5 秒超时）
2. 若拉到新消息，提取最新 context_token
3. 若没拉到，则继续使用 runtime cache 或 Secrets 里的 CONTEXT_TOKEN
4. 每次运行都会把最新 context_token 与 get_updates_buf 写入 .runtime/state.json
5. workflow 使用 Actions Cache 还原/保存 .runtime，实现跨次运行持久化

这样下次运行会优先用上次缓存值，不需要额外 GH_PAT。

## 开源推荐实践

1. 仓库只提交 `birthdays.example.json` 与 `birthdays.schema.json`
2. 本地使用 `birthdays.json` 保存真实数据，不要提交
3. GitHub Actions 使用 `BIRTHDAYS_JSON` Secret 注入真实数据
4. 运行缓存继续使用 Actions Cache（`.runtime`）

## birthdays.json 维护规范

每个成员字段顺序建议固定为：

- id
- parentId
- spouseId
- familyName
- generation
- name
- nickName（可选）
- relation
- birthYear
- gender
- birthdayType
- birthMonth
- birthDay

说明：

- birthdayType 支持 lunar 和 solar
- 农历生日按农历月日匹配，阳历生日按公历月日匹配

## 常见问题

1) 没人生日为什么也收到消息？

这是设计行为，用于确认定时任务和发送链路正常。

2) 报错缺少 CONTEXT_TOKEN 怎么办？

先给 Bot 发一条消息，再把拿到的 CONTEXT_TOKEN 配置到 Secret 或本地环境变量。

3) 为什么要保存 get_updates_buf？

它是增量拉取游标，不保存会反复读取旧消息。

4) 配了 AI_KEY 但还是发了“复制给 AI”的 prompt？

代表 AI 接口调用失败或返回为空，系统会自动回退到手动模式，避免当天消息中断。

## 踩坑总结（实战经验）

1) `sendmessage` 的 HTTP 200 不等于消息已送达

- 需同时检查返回里的 `ret`
- `ret=0` 才是成功
- `ret=-2` 常见于 `context_token` 失效

2) `context_token` 不是永久有效

- 必须每次运行先 `getupdates` 刷新
- 刷新失败时回退到缓存 token

3) `get_updates_buf` 必须持久化

- 它是增量游标（cursor）
- 不持久化会重复读取历史消息，导致上下文混乱

4) iLink 更像 IM 增量同步协议，不是简单 webhook

- 建议按“轻量 IM 客户端”思路处理 `getupdates` / `cursor` / `session`

5) GitHub Actions 的时间与触发特性

- `cron` 使用 UTC，需要换算北京时间
- `schedule` 可能有分钟级延迟，不保证绝对准点

6) 开源场景推荐

- 真实生日数据放本地文件或 `BIRTHDAYS_JSON` Secret
- 运行时会话状态放 Actions Cache（`.runtime/state.json`）
