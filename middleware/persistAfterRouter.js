const { persistDb, usePg } = require('../config');

/**
 * بعد از هر تغییر از طریق روتر json-server، دیتا را ذخیره می‌کند (فایل db.json یا PostgreSQL).
 */
function persistAfterRouter(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
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
