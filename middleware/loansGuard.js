const { db } = require('../config');

/**
 * جلوگیری از ثبت وام جدید برای عضوی که وام فعال (توصیه‌نشده) دارد.
 */
function loansGuard(req, res, next) {
  const body = req.body || {};
  const memberId = body.memberId;
  if (!memberId) return next();
  const loans = db.loans || [];
  const hasActive = loans.some(
    (l) => String(l.memberId) === String(memberId) && (l.status === 'active' || l.status == null)
  );
  if (hasActive) {
    return res.status(400).json({
      message: 'این عضو قبلاً وام فعال دارد. امکان ثبت وام جدید تا تسویه یا توصیه شدن وام قبلی وجود ندارد.',
    });
  }
  next();
}

module.exports = loansGuard;
