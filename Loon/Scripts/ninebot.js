/**
 * 九号出行签到脚本（单账号版 / 修复连续签到天数统计11）
 * cron: 0 9 * * *
 * 环境变量 NINEBOT = deviceId#Bearer token
 */

const ENV = $persistentStore.read("NINEBOT");
if (!ENV || !ENV.includes("#")) {
  $notification.post("九号出行 ❌", "", "未配置 NINEBOT 环境变量");
  $done();
}

const [deviceId, token] = ENV.split("#");
const headers = {
  "Authorization": token.trim(),
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 15_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Segway v6 C 609053474",
  "Origin": "https://h5-bj.ninebot.com",
  "Referer": "https://h5-bj.ninebot.com/",
  "Host": "cn-cbu-gateway.ninebot.com",
  "from_platform_1": "1",
  "language": "zh"
};

const now = Date.now();
const today = new Date();
today.setHours(0, 0, 0, 0);
const url_base = "https://cn-cbu-gateway.ninebot.com/portal/api/user-sign/v2";

function httpGet(url) {
  return new Promise(resolve => {
    $httpClient.get({ url, headers }, (err, resp, body) => {
      resolve({ err, status: resp?.status, body });
    });
  });
}

function httpPost(url, data) {
  return new Promise(resolve => {
    $httpClient.post({ url, headers, body: JSON.stringify(data) }, (err, resp, body) => {
      resolve({ err, status: resp?.status, body });
    });
  });
}

(async () => {
  let output = [`账号 [${deviceId}]`];
  let signed = false;
  let signDays = 0;

  // 获取签到日历
  const calRes = await httpGet(`${url_base}/calendar?t=${now}`);
  try {
    const calData = JSON.parse(calRes.body);
    const info = Array.isArray(calData.data?.calendarInfo) ? calData.data.calendarInfo : [];
    const currentDay = calData.data?.currentTimestamp;

    // 判断今日是否签到（sign = 1 或 2 都算）
    signed = info.some(i => i.timestamp === currentDay && (i.sign === 1 || i.sign === 2));
    output.push(signed ? "✅ 今日已签到" : "⚠️ 今日未签到");

    // 连续签到天数判断（倒序按天统计）
    const sorted = info
      .filter(i => (i.sign === 1 || i.sign === 2) && i.timestamp <= currentDay)
      .sort((a, b) => b.timestamp - a.timestamp);

    let count = 0;
    let expected = currentDay;
    for (let item of sorted) {
      if (item.timestamp === expected) {
        count++;
        expected -= 86400000;
      } else {
        break;
      }
    }
    signDays = count;
  } catch {
    output.push("⚠️ 签到状态获取失败");
  }

  // 若未签到，执行签到
  if (!signed) {
    const res = await httpPost(`${url_base}/sign`, { deviceId });
    try {
      const json = JSON.parse(res.body);
      if (json.code === 0) output.push("✨ 签到成功");
      else output.push(`❌ 签到失败：${json.msg || "未知"}`);
    } catch {
      output.push("❌ 签到接口异常");
    }
  }

  // 查询盲盒信息
  const boxRes = await httpGet(`${url_base}/blind-box/list?t=${now}`);
  try {
    const boxData = JSON.parse(boxRes.body);
    const notOpened = boxData.data?.notOpenedBoxes?.[0];
    if (notOpened) {
      output.push(`📦 盲盒：${notOpened.leftDaysToOpen} 天后可领（目标 ${notOpened.awardDays} 天）`);
    } else {
      output.push("📦 无盲盒数据");
    }
  } catch {
    output.push("📦 盲盒数据解析失败");
  }

  output.push(`连续签到：${signDays} 天`);
  $notification.post("九号出行签到 ✅", "", output.join("\n"));
  console.log(output.join("\n"));
  $done();
})();
