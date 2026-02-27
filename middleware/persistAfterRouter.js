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

      if (isNewLoanRequest && telegramBot) {
        const telegramSettings = db.telegramSettings || {};
        const userName = body.userName ? `@${body.userName}` : 'ناشناس';
        const chatId = String(body.telegramChatId || '');
        const textForChannel = `📩 درخواست وام جدید از ${userName} (Chat ID: ${chatId}).`;
        const adminTpl = (telegramSettings.loanRequestAdminTemplate || '').trim();
        const textForAdmin = adminTpl
          ? adminTpl.replace(/\{userName\}/g, userName).replace(/\{chatId\}/g, chatId)
          : textForChannel;
        const notifyTarget = (telegramSettings.notifyTarget || '').trim();
        const sendToAdmin = notifyTarget && telegramSettings.sendLoanRequestToAdmin !== false;

        console.log('[Telegram/چت-مدیر] درخواست وام جدید ثبت شد؛ notifyTarget=', notifyTarget ? 'تنظیم‌شده (' + (notifyTarget.length > 4 ? notifyTarget.slice(0, 2) + '...' + notifyTarget.slice(-2) : '***') + ')' : 'خالی', ', sendLoanRequestToAdmin=', telegramSettings.sendLoanRequestToAdmin);

        setImmediate(async () => {
          try {
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
              console.log('[Telegram/چت-مدیر] ارسال اعلان درخواست وام به چت مدیر اصلی.');
              await telegramBot.sendMessage(String(notifyTarget), textForAdmin)
                .then(() => console.log('[Telegram/چت-مدیر] اعلان درخواست وام به چت مدیر ارسال شد.'))
                .catch((err) => {
                  console.error('[Telegram/چت-مدیر] خطا در ارسال اعلان درخواست وام به چت مدیر:', err.message);
                });
            } else if (!notifyTarget) {
              console.log('[Telegram/چت-مدیر] چت مدیر اصلی (notifyTarget) خالی است؛ اعلان درخواست وام به مدیر ارسال نمی‌شود.');
            } else {
              console.log('[Telegram/چت-مدیر] ارسال به مدیر غیرفعال است (sendLoanRequestToAdmin=false).');
            }
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
