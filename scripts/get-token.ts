const BASE_URL = "https://ilinkai.weixin.qq.com";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateWechatUin() {
  const randomUint32 = Math.floor(Math.random() * 0xffffffff);
  return Buffer.from(String(randomUint32)).toString("base64");
}

async function apiPost(path: string, body: any, token: string, baseUrl = BASE_URL) {
  const res = await fetch(`${baseUrl}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      AuthorizationType: "ilink_bot_token",
      Authorization: `Bearer ${token}`,
      "X-WECHAT-UIN": generateWechatUin(),
    },
    body: JSON.stringify({
      ...body,
      base_info: {
        channel_version: "0.1.0",
      },
    }),
  });

  const text = await res.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return text;
  }
}

async function main() {
  console.log("正在获取二维码...");

  const qrRes = await fetch(
    `${BASE_URL}/ilink/bot/get_bot_qrcode?bot_type=3`,
  ).then((r) => r.json());

  const { qrcode, qrcode_img_content } = qrRes;

  console.log("\n请用 iOS 微信扫描下面链接生成的二维码：");
  console.log(qrcode_img_content);
  console.log("\n等待扫码确认...");

  let botToken = "";
  let botBaseUrl = BASE_URL;

  while (true) {
    const status = await fetch(
      `${BASE_URL}/ilink/bot/get_qrcode_status?qrcode=${qrcode}`,
      {
        headers: {
          "iLink-App-ClientVersion": "1",
        },
      },
    ).then((r) => r.json());

    if (status.status === "confirmed") {
      botToken = status.bot_token;
      botBaseUrl = status.baseurl || BASE_URL;

      console.log("\n✅ 登录成功");
      console.log("====================================");
      console.log("ILINK_TOKEN:");
      console.log(botToken);
      console.log("");
      console.log("BOT_BASE_URL:");
      console.log(botBaseUrl);
      console.log("");
      console.log("QRCODE:");
      console.log(qrcode);
      console.log("====================================");
      break;
    }

    if (status.status === "expired") {
      console.log("❌ 二维码过期了，请重新运行脚本");
      process.exit(1);
    }

    if (status.status === "scaned") {
      console.log("已扫码，请在微信上确认...");
    }

    await sleep(1000);
  }

  console.log("\n请现在用你的微信给 Bot 发送一句话，例如：绑定我");
  console.log("等待接收消息，用来获取 TO_USER_ID 和 CONTEXT_TOKEN...\n");

  let getUpdatesBuf = "";

  while (true) {
    try {
      const resp = await apiPost(
        "ilink/bot/getupdates",
        {
          get_updates_buf: getUpdatesBuf,
        },
        botToken,
        botBaseUrl,
      );

      if (resp.get_updates_buf) {
        getUpdatesBuf = resp.get_updates_buf;
      }

      for (const msg of resp.msgs ?? []) {
        if (msg.message_type !== 1) continue;

        const text = msg.item_list?.find((item: any) => item.type === 1)
          ?.text_item?.text;

        if (!text) continue;

        const userId = msg.from_user_id;
        const contextToken = msg.context_token;

        console.log("\n✅ 收到你的消息");
        console.log("====================================");
        console.log("消息内容:");
        console.log(text);
        console.log("");
        console.log("TO_USER_ID:");
        console.log(userId);
        console.log("");
        console.log("CONTEXT_TOKEN:");
        console.log(contextToken);
        console.log("====================================");

        console.log("\n最终填到 GitHub Secrets / .env 的内容：");
        console.log("====================================");
        console.log(`ILINK_TOKEN=${botToken}`);
        console.log(`TO_USER_ID=${userId}`);
        console.log(`CONTEXT_TOKEN=${contextToken}`);
        console.log(`BOT_BASE_URL=${botBaseUrl}`);
        console.log("====================================");

        console.log("\n✅ 获取完成");
        process.exit(0);
      }
    } catch (error: any) {
      console.error("❌ 获取消息失败:", error.message || error);
      await sleep(2000);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
