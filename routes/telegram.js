const express = require('express');
const https = require('https');
const { db } = require('../config');
const { getTelegramProxyUrl, createTelegramProxyAgent } = require('../lib/telegramProxy');

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

module.exports = router;
