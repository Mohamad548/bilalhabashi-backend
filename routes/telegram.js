const express = require('express');
const https = require('https');
const { db } = require('../config');
const { getTelegramProxyUrl, createTelegramProxyAgent } = require('../lib/telegramProxy');
const { formatNumTelegram } = require('../shamsiUtils');

let telegramBot = null;
try {
  telegramBot = require('../telegramBot');
} catch (e) {}

const router = express.Router();

router.get('/telegram/check', (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.json({ connected: false, message: 'توکن ربات در سرور تنظیم نشده است.' });
  }
  const proxyUrl = getTelegramProxyUrl();
  if (proxyUrl) {
    try {
      const u = new URL(proxyUrl);
      console.log('[Telegram/check] درخواست از طریق پروکسی: ' + u.hostname + ':' + (u.port || '80'));
    } catch (e) {}
  } else {
    console.log('[Telegram/check] درخواست بدون پروکسی');
  }
  const agent = createTelegramProxyAgent(proxyUrl);
  const url = new URL(`https://api.telegram.org/bot${token}/getMe`);
  const options = { hostname: url.hostname, path: url.pathname + url.search, method: 'GET' };
  if (agent) options.agent = agent;

  const reqTelegram = https.request(options, (apiRes) => {
    let data = '';
    apiRes.on('data', (chunk) => { data += chunk; });
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.ok && json.result) {
          res.json({
            connected: true,
            message: 'ارتباط با تلگرام برقرار است.',
            username: json.result.username,
          });
          const notifyChatId = (process.env.TELEGRAM_NOTIFY_CHAT_ID || '').trim();
          if (telegramBot && notifyChatId) {
            const text = '✅ ارتباط با موفقیت برقرار شد.\n(از دکمه «بررسی ارتباط» در پنل ادمین)';
            telegramBot.sendMessage(notifyChatId, text).catch((err) => {
              console.error('[Telegram/check] خطا در ارسال پیام به تلگرام:', err.message);
            });
          }
          return;
        }
        return res.json({ connected: false, message: json.description || 'پاسخ نامعتبر از تلگرام.' });
      } catch (e) {
        return res.json({ connected: false, message: 'خطا در خواندن پاسخ سرور.' });
      }
    });
  });
  reqTelegram.on('error', (err) => {
    console.error('[Telegram/check] خطا:', err.message);
    res.json({ connected: false, message: 'خطا در ارتباط با سرور تلگرام: ' + err.message });
  });
  reqTelegram.end();
});

router.post('/loanRequests/:id/notifyRejection', (req, res) => {
  const id = req.params.id;
  const reason = (req.body && req.body.reason) ? String(req.body.reason).trim() : '';
  const request = db.loanRequests.find((r) => String(r.id) === String(id));
  if (!request) {
    return res.status(404).json({ message: 'درخواست یافت نشد.' });
  }
  const chatId = request.telegramChatId;
  if (telegramBot && chatId) {
    const text = '❌ درخواست وام شما رد شد.\n\n' + (reason ? 'علت: ' + reason : '');
    telegramBot.sendMessage(String(chatId), text).catch((err) => {
      console.error('[Telegram] خطا در ارسال پیام رد درخواست:', err.message);
    });
  }
  res.json({ success: true });
});

router.post('/loanRequests/:id/notifyApproval', (req, res) => {
  const id = req.params.id;
  const request = db.loanRequests.find((r) => String(r.id) === String(id));
  if (!request) {
    return res.status(404).json({ message: 'درخواست یافت نشد.' });
  }
  const chatId = request.telegramChatId;
  if (telegramBot && chatId) {
    const text = '✅ درخواست شما تأیید شد و در لیست اعطا کنندگان درخواست وام قرار گرفته است.';
    telegramBot.sendMessage(String(chatId), text).catch((err) => {
      console.error('[Telegram] خطا در ارسال پیام تأیید درخواست:', err.message);
    });
  }
  res.json({ success: true });
});

// انتشار لیست افراد در انتظار وام (درخواست‌های تأیید‌شده) در کانال‌ها/گروه‌های تنظیم‌شده
router.post('/loanRequests/broadcastWaiting', async (req, res) => {
  if (!telegramBot) {
    return res.status(500).json({ message: 'ربات تلگرام فعال نیست.' });
  }

  const approved = (db.loanRequests || []).filter((r) => r.status === 'approved');
  if (!approved.length) {
    return res.status(200).json({ message: 'درخواستی با وضعیت تأیید شده وجود ندارد.' });
  }

  // مرتب‌سازی بر اساس تاریخ ایجاد (قدیمی‌تر اول)
  approved.sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dbt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return da - dbt;
  });

  // تلاش برای پیدا کردن نام عضو بر اساس telegramChatId
  const members = db.members || [];
  const telegramSettings = db.telegramSettings || {};
  const lineTpl = (telegramSettings.broadcastWaitingLineTemplate || '').trim();

  const lines = approved.map((r, idx) => {
    const member =
      members.find((m) => m.telegramChatId && String(m.telegramChatId) === String(r.telegramChatId)) || null;
    const baseName = member?.fullName || (r.userName ? `@${r.userName}` : `Chat ID: ${r.telegramChatId || 'نامشخص'}`);
    const created = r.createdAt ? new Date(r.createdAt) : null;
    const createdDate =
      created && !isNaN(created.getTime())
        ? `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(
            created.getDate()
          ).padStart(2, '0')}`
        : 'تاریخ نامشخص';

    const indexFa = formatNumTelegram(idx + 1);
    if (lineTpl) {
      return lineTpl
        .replace(/\{row\}/g, indexFa)
        .replace(/\{name\}/g, baseName)
        .replace(/\{date\}/g, createdDate);
    }
    return `${indexFa}) ${baseName} – تاریخ ثبت درخواست: ${createdDate}`;
  });

  const listBody = lines.join('\n');
  const customTpl = (telegramSettings.broadcastWaitingTemplate || '').trim();
  // اگر کاربر متن دلخواه وارد کرده باشد فقط همان ارسال می‌شود؛ متن پیش‌فرض «لیست افراد در انتظار وام» فقط وقتی ارسال می‌شود که قالب خالی باشد.
  const text =
    customTpl.length > 0
      ? customTpl
          .replace(/\{list\}/g, listBody)
          .replace(/\{count\}/g, String(approved.length))
      : '📢 لیست افراد در انتظار وام (درخواست‌های تأیید‌شده):\n\n' + listBody;

  // اگر از کلاینت target ارسال شده باشد، مستقیماً از آن استفاده می‌کنیم؛ وگرنه از تنظیمات تلگرام (کانال/گروه) یا env
  const bodyTarget = req.body && req.body.target ? String(req.body.target).trim() : '';
  let chatIds = [];
  if (bodyTarget) {
    chatIds = [bodyTarget];
  } else {
    const telegramSettings = db.telegramSettings || {};
    const fromSettings = [
      telegramSettings.adminChannelTarget,
      telegramSettings.adminGroupTarget,
      telegramSettings.adminTarget,
    ]
      .filter(Boolean)
      .map((s) => String(s).trim())
      .filter(Boolean);
    if (fromSettings.length > 0) {
      chatIds = [...new Set(fromSettings)];
    } else {
      const rawList = (process.env.TELEGRAM_BROADCAST_CHAT_IDS || '').trim();
      const notifyChatId = (process.env.TELEGRAM_NOTIFY_CHAT_ID || '').trim();
      chatIds = rawList
        ? rawList.split(',').map((s) => s.trim()).filter(Boolean)
        : notifyChatId ? [notifyChatId] : [];
    }
  }

  if (!chatIds.length) {
    return res
      .status(400)
      .json({ message: 'مقصدی برای ارسال تنظیم نشده است. در تنظیمات تلگرام، تب عمومی، کانال یا گروه اعلانات را پر کنید.' });
  }

  const results = [];
  for (const cid of chatIds) {
    try {
      await telegramBot.sendMessage(String(cid), text);
      results.push({ chatId: cid, success: true });
    } catch (err) {
      console.error('[Telegram] خطا در ارسال لیست در انتظار وام به', cid, ':', err.message);
      results.push({ chatId: cid, success: false, error: err.message });
    }
  }

  res.json({ success: true, count: approved.length, sentTo: results });
});

module.exports = router;
