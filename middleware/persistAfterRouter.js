const { persistDb, usePg, db } = require('../config');

let telegramBot = null;
try {
  telegramBot = require('../telegramBot');
} catch (e) {}

/**
 * بعد از هر تغییر از طریق روتر json-server، دیتا را ذخیره می‌کند (فایل db.json یا PostgreSQL).
 * در صورت ثبت درخواست وام جدید، در صورت فعال بودن تنظیم، به کانال/گروه اعلان ارسال می‌کند.
 */
function persistAfterRouter(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const path = (req.originalUrl || req.url || '').replace(/\?.*$/, '');
      const isNewLoanRequest =
        req.method === 'POST' &&
        path === '/api/loanRequests' &&
        body &&
        body.telegramChatId != null;

      if (req.method === 'POST' && path === '/api/loanRequests') {
        console.log('[Telegram/درخواست-وام] ----- پاسخ POST /api/loanRequests -----');
        console.log('[Telegram/درخواست-وام] path=', path, ', method=', req.method);
        console.log('[Telegram/درخواست-وام] body کلیدها=', body ? Object.keys(body).join(', ') : 'بدون body');
        console.log('[Telegram/درخواست-وام] body.telegramChatId=', body && body.telegramChatId, ', body.userName=', body && body.userName);
        console.log('[Telegram/درخواست-وام] isNewLoanRequest=', isNewLoanRequest, '(نیاز: POST + path=/api/loanRequests + body.telegramChatId موجود)');
        console.log('[Telegram/درخواست-وام] telegramBot موجود؟', !!telegramBot);
        if (!isNewLoanRequest && path === '/api/loanRequests') {
          if (!body) console.log('[Telegram/درخواست-وام] علت عدم ارسال: body خالی است.');
          else if (body.telegramChatId == null) console.log('[Telegram/درخواست-وام] علت عدم ارسال: body.telegramChatId موجود نیست.');
          else if (!telegramBot) console.log('[Telegram/درخواست-وام] علت عدم ارسال: telegramBot بارگذاری نشده.');
        }
        console.log('[Telegram/درخواست-وام] ----- پایان لاگ پاسخ -----');
      }

      if (isNewLoanRequest && telegramBot) {
        const telegramSettings = db.telegramSettings || {};
        const userName = body.userName ? `@${body.userName}` : 'ناشناس';
        const chatId = String(body.telegramChatId || '');
        const textForChannel = `📩 درخواست وام جدید از ${userName} (Chat ID: ${chatId}).`;
        const adminTpl = (telegramSettings.loanRequestAdminTemplate || '').trim();
        const defaultAdminText = `📩 ${userName} درخواست وام دارد.`;
        const textForAdmin = adminTpl
          ? adminTpl.replace(/\{userName\}/g, userName).replace(/\{chatId\}/g, chatId)
          : defaultAdminText;
        const notifyTarget = (telegramSettings.notifyTarget || '').trim();
        const sendToAdmin = notifyTarget && telegramSettings.sendLoanRequestToAdmin !== false;

        console.log('[Telegram/چت-مدیر] ----- شروع ارسال اعلان درخواست وام -----');
        console.log('[Telegram/چت-مدیر] db.telegramSettings موجود؟', !!db.telegramSettings, '| کلیدها:', db.telegramSettings ? Object.keys(db.telegramSettings).join(', ') : '—');
        console.log('[Telegram/چت-مدیر] notifyTarget (چت مدیر اصلی)=', notifyTarget ? `"${notifyTarget}"` : 'خالی', '| sendLoanRequestToAdmin=', telegramSettings.sendLoanRequestToAdmin);
        console.log('[Telegram/چت-مدیر] ارسال به مدیر فعال؟ (sendToAdmin)=', sendToAdmin);
        console.log('[Telegram/چت-مدیر] متن اعلان به مدیر:', textForAdmin.substring(0, 80) + (textForAdmin.length > 80 ? '...' : ''));
        console.log('[Telegram/چت-مدیر] قرار است در setImmediate ارسال شود: sendToAdmin=', sendToAdmin, ', notifyTarget=', notifyTarget ? 'تنظیم‌شده' : 'خالی');

        setImmediate(async () => {
          try {
            console.log('[Telegram/چت-مدیر] [داخل setImmediate] شروع ارسال؛ sendToAdmin=', sendToAdmin, ', notifyTarget=', notifyTarget);
            if (telegramSettings.sendLoanRequestGroup !== false) {
              const adminTargets = [
                telegramSettings.adminChannelTarget,
                telegramSettings.adminGroupTarget,
                telegramSettings.adminTarget,
                process.env.TELEGRAM_ADMIN_GROUP_ID,
              ]
                .filter(Boolean)
                .map((s) => String(s).trim())
                .filter(Boolean);
              const uniqueTargets = [...new Set(adminTargets)];
              for (const targetId of uniqueTargets) {
                await telegramBot.sendMessage(String(targetId), textForChannel).catch((err) => {
                  console.error('[Telegram] خطا در ارسال اعلان درخواست وام به کانال/گروه:', err.message);
                });
              }
            }
            if (sendToAdmin) {
              console.log('[Telegram/چت-مدیر] در حال ارسال پیام به چت مدیر، chatId=', notifyTarget);
              await telegramBot.sendMessage(String(notifyTarget), textForAdmin)
                .then(() => console.log('[Telegram/چت-مدیر] ✓ اعلان درخواست وام با موفقیت به چت مدیر ارسال شد.'))
                .catch((err) => {
                  console.error('[Telegram/چت-مدیر] ✗ خطا در ارسال به چت مدیر:', err.message, '| response=', err.response && err.response.body ? JSON.stringify(err.response.body) : '—');
                  if (err.message && err.message.includes('chat not found')) {
                    console.error('[Telegram/چت-مدیر] راهنما: مدیر باید یک بار ربات را در تلگرام باز کند و /start بزند تا ربات بتواند به او پیام بفرستد.');
                  }
                });
            } else if (!notifyTarget) {
              console.log('[Telegram/چت-مدیر] چت مدیر اصلی (notifyTarget) خالی است؛ اعلان ارسال نمی‌شود. در تنظیمات «آیدی/یوزرنیم چت مدیر اصلی» را پر کنید (مثلاً @mahmodi298 یا عدد Chat ID).');
            } else {
              console.log('[Telegram/چت-مدیر] ارسال به مدیر غیرفعال است (تیک «اعلان درخواست وام به چت مدیر» را در تنظیمات بزنید).');
            }
            console.log('[Telegram/چت-مدیر] ----- پایان ارسال اعلان درخواست وام -----');
          } catch (e) {
            console.error('[Telegram] خطا در ارسال اعلان درخواست وام:', e.message);
          }
        });
      }

      if (usePg) {
        persistDb()
          .then(() => originalJson(body))
          .catch((err) => {
            console.error('[persistDb] خطا در ذخیره به Neon:', err.message);
            originalJson(body);
          });
      } else {
        persistDb();
        return originalJson(body);
      }
    };
  }
  next();
}

module.exports = persistAfterRouter;
