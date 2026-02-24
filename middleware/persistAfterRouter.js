const { persistDb } = require('../config');

/**
 * بعد از هر تغییر از طریق روتر json-server، فایل db.json را ذخیره می‌کند.
 */
function persistAfterRouter(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      persistDb();
      return originalJson(body);
    };
  }
  next();
}

module.exports = persistAfterRouter;
