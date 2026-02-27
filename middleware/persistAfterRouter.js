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
          const userName = body.userName ? `@${body.userName}` : 'ناشناس';
          const text = `📩 درخواست وام جدید از ${userName} (Chat ID: ${body.telegramChatId}).`;
          const notifyTarget = (telegramSettings.notifyTarget || '').trim();
          setImmediate(() => {
            for (const targetId of uniqueTargets) {
              telegramBot.sendMessage(String(targetId), text).catch((err) => {
                console.error('[Telegram] خطا در ارسال اعلان درخواست وام به کانال/گروه:', err.message);
              });
            }
            if (notifyTarget && telegramSettings.sendLoanRequestToAdmin !== false) {
              telegramBot.sendMessage(String(notifyTarget), text).catch((err) => {
                console.error('[Telegram] خطا در ارسال اعلان درخواست وام به چت مدیر:', err.message);
              });
            }
          });
        }
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
