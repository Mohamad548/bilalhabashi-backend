const express = require('express');
const https = require('https');
const { db, persistDb, usePg } = require('../config');
const { getTelegramProxyUrl, createTelegramProxyAgent } = require('../lib/telegramProxy');
const { formatNumTelegram } = require('../shamsiUtils');

let telegramBot = null;
try {
  telegramBot = require('../telegramBot');
} catch (e) {}

const router = express.Router();

// دریافت به‌روزرسانی‌های تلگرام وقتی TELEGRAM_WEBHOOK_URL تنظیم شده (جلوگیری از ۴۰۹)
router.post('/telegram-webhook', (req, res) => {
  if (telegramBot && typeof telegramBot.processUpdate === 'function') {
    telegramBot.processUpdate(req.body);
  }
  res.sendStatus(200);
});

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

// لینک ربات برای دکمه «برقراری با تلگرام»
router.get('/telegram/bot-link', (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.json({ ok: false, message: 'توکن ربات تنظیم نشده است.' });
  }
  const agent = createTelegramProxyAgent(getTelegramProxyUrl());
  const url = new URL(`https://api.telegram.org/bot${token}/getMe`);
  const options = { hostname: url.hostname, path: url.pathname + url.search, method: 'GET' };
  if (agent) options.agent = agent;
  const reqTelegram = https.request(options, (apiRes) => {
    let data = '';
    apiRes.on('data', (chunk) => { data += chunk; });
    apiRes.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.ok && json.result && json.result.username) {
          const url = `https://t.me/${json.result.username}`;
          return res.json({ ok: true, url, linkAdmin: `${url}?start=admin` });
        }
        return res.json({ ok: false, message: json.description || 'نامعتبر' });
      } catch (e) {
        return res.json({ ok: false, message: 'خطا در خواندن پاسخ' });
      }
    });
  });
  reqTelegram.on('error', (err) => res.json({ ok: false, message: err.message }));
  reqTelegram.end();
});

// اتصال چت مدیر از داخل ربات (با /start admin) — فقط از localhost یا با سکرت
router.post('/telegram/link-admin', async (req, res) => {
  const remote = req.ip || req.socket?.remoteAddress || '';
  const secret = (req.headers['x-internal-secret'] || '').trim();
  const allowed = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1' ||
    (process.env.TELEGRAM_LINK_SECRET && secret === process.env.TELEGRAM_LINK_SECRET);
  if (!allowed) {
    console.log('[Telegram/چت-مدیر] link-admin رد شد؛ IP/سکرت نامعتبر. remote=', remote);
    return res.status(403).json({ success: false, error: 'غیرمجاز' });
  }
  const chatId = req.body && req.body.chatId != null ? String(req.body.chatId).trim() : '';
  if (!chatId) {
    return res.status(400).json({ success: false, error: 'chatId الزامی است.' });
  }
  if (!db.telegramSettings) db.telegramSettings = {};
  db.telegramSettings.notifyTarget = chatId;
  try {
    if (usePg) await persistDb();
    else persistDb();
    console.log('[Telegram/چت-مدیر] چت مدیر با موفقیت ثبت شد؛ notifyTarget=', chatId);
    return res.json({ success: true, notifyTarget: chatId });
  } catch (err) {
    console.error('[Telegram/چت-مدیر] خطا در ذخیره link-admin:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// قطع ارتباط چت مدیر (از پنل)
router.post('/telegram/unlink-admin', async (req, res) => {
  if (!db.telegramSettings) db.telegramSettings = {};
  db.telegramSettings.notifyTarget = '';
  try {
    if (usePg) await persistDb();
    else persistDb();
    console.log('[Telegram/چت-مدیر] چت مدیر قطع شد (unlink-admin).');
    return res.json({ success: true });
  } catch (err) {
    console.error('[Telegram/چت-مدیر] خطا در unlink-admin:', err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// تست اتصال چت مدیر اصلی با ربات (ارسال پیام تست + لاگ)
router.post('/telegram/test-admin-chat', async (req, res) => {
  const target = (req.body && req.body.notifyTarget != null ? String(req.body.notifyTarget).trim() : (db.telegramSettings && db.telegramSettings.notifyTarget) ? String(db.telegramSettings.notifyTarget).trim() : '');
  const isUsername = target.startsWith('@');
  const isNumeric = /^\d+$/.test(target.replace(/\s/g, ''));
  console.log('[Telegram/چت-مدیر] درخواست تست اتصال چت مدیر؛ target=', target ? `"${target}"` : 'خالی', '| نوع=', isUsername ? 'یوزرنیم' : isNumeric ? 'عدد' : 'سایر', '| طول=', target.length);
  if (!target) {
    console.log('[Telegram/چت-مدیر] تست اتصال لغو شد: چت مدیر اصلی خالی است.');
    return res.status(400).json({ success: false, error: 'چت مدیر اصلی خالی است. ابتدا آیدی یا یوزرنیم را وارد کنید.' });
  }
  if (!telegramBot) {
    console.log('[Telegram/چت-مدیر] تست اتصال لغو شد: ربات تلگرام در دسترس نیست.');
    return res.status(503).json({ success: false, error: 'ربات تلگرام در سرور فعال نیست.' });
  }
  const testMessage = '✅ اتصال با ربات برقرار است. این پیام تست از پنل ادمین است.';
  try {
    console.log('[Telegram/چت-مدیر] در حال ارسال پیام تست به تلگرام، chat_id=', target);
    await telegramBot.sendMessage(String(target), testMessage);
    console.log('[Telegram/چت-مدیر] تست اتصال موفق؛ پیام تست به چت مدیر ارسال شد. (target=', target, ')');
    return res.json({ success: true, message: 'پیام تست به چت مدیر ارسال شد. اگر دریافت کردید، اتصال برقرار است.' });
  } catch (err) {
    const responseBody = err.response && typeof err.response.body === 'object' ? JSON.stringify(err.response.body) : (err.response && err.response.body) ? String(err.response.body).slice(0, 200) : '—';
    console.error('[Telegram/چت-مدیر] تست اتصال ناموفق؛ خطا:', err.message);
    console.error('[Telegram/چت-مدیر] پاسخ خام تلگرام (response.body):', responseBody);
    if (err.message && err.message.includes('chat not found')) {
      console.error('[Telegram/چت-مدیر] راهنما: مدیر باید یک بار ربات را در تلگرام باز کند و /start بزند.');
      console.error('[Telegram/چت-مدیر] اگر با یوزرنیم (@...) کار نکرد، در ربات /start بزنید؛ ربات «شماره چت» را نشان می‌دهد. آن عدد را در فیلد چت مدیر اصلی بگذارید.');
      return res.status(400).json({
        success: false,
        error: 'چت پیدا نشد. اگر با یوزرنیم (@...) کار نکرد، در ربات /start بزنید؛ در پیام خوش‌آمد ربات «شماره چت شما» را ببینید و همان عدد را اینجا وارد کنید.',
        errorCode: 'chat_not_found',
      });
    }
    return res.status(400).json({ success: false, error: err.message || 'ارسال ناموفق' });
  }
});

// اعلان به چت مدیر اصلی وقتی عضو از ربات درخواست وام ثبت کرد (فراخوانی از خود ربات بعد از POST /api/loanRequests)
router.post('/telegram/notify-admin-new-loan-request', async (req, res) => {
  const telegramChatId = req.body && req.body.telegramChatId != null ? String(req.body.telegramChatId).trim() : '';
  const userName = req.body && req.body.userName != null ? String(req.body.userName).trim() : 'ناشناس';
  const userNameDisplay = userName.startsWith('@') ? userName : `@${userName}`;
  const chatId = String(telegramChatId || '');

  console.log('[Telegram/چت-مدیر] notify-admin-new-loan-request فراخوانی شد؛ chatId=', chatId, ', userName=', userNameDisplay);

  const telegramSettings = db.telegramSettings || {};
  const notifyTarget = (telegramSettings.notifyTarget || '').trim();
  const sendToAdmin = notifyTarget && telegramSettings.sendLoanRequestToAdmin !== false;

  if (!sendToAdmin) {
    console.log('[Telegram/چت-مدیر] اعلان به مدیر ارسال نمی‌شود؛ notifyTarget=', notifyTarget ? 'تنظیم‌شده' : 'خالی', ', sendLoanRequestToAdmin=', telegramSettings.sendLoanRequestToAdmin);
    return res.json({ success: true, sent: false });
  }

  const member = (db.members || []).find((m) => m.telegramChatId && String(m.telegramChatId) === chatId);
  const memberName = member ? (member.fullName || userNameDisplay) : userNameDisplay;

  const adminTpl = (telegramSettings.loanRequestAdminTemplate || '').trim();
  const defaultAdminText = `📩 ${memberName} درخواست وام دارد.`;
  const textForAdmin = adminTpl
    ? adminTpl.replace(/\{memberName\}/g, memberName).replace(/\{userName\}/g, userNameDisplay).replace(/\{chatId\}/g, chatId)
    : defaultAdminText;

  if (!telegramBot) {
    console.log('[Telegram/چت-مدیر] ربات تلگرام در دسترس نیست؛ اعلان ارسال نشد.');
    return res.json({ success: true, sent: false });
  }

  try {
    await telegramBot.sendMessage(String(notifyTarget), textForAdmin);
    console.log('[Telegram/چت-مدیر] ✓ اعلان درخواست وام به چت مدیر ارسال شد (از مسیر notify-admin-new-loan-request).');
    return res.json({ success: true, sent: true });
  } catch (err) {
    console.error('[Telegram/چت-مدیر] ✗ خطا در ارسال اعلان به مدیر:', err.message);
    return res.status(500).json({ success: false, sent: false, error: err.message });
  }
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
