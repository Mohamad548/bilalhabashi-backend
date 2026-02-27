/**
 * ریست دیتابیس — فقط users و members حفظ می‌شوند (مبالغ اعضا صفر می‌شود).
 * فقط ادمین (با توکن معتبر) می‌تواند فراخوانی کند.
 */
const express = require('express');
const { db, persistDb } = require('../config');

const router = express.Router();

function getAuthUser(req) {
  const authHeader = (req.headers.authorization || '').trim();
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token || !token.startsWith('token_')) return null;
  const parts = token.split('_');
  const userId = parts[1];
  if (!userId) return null;
  const user = db.users.find((u) => String(u.id) === String(userId));
  return user || null;
}

router.post('/admin/reset-db', async (req, res) => {
  const user = getAuthUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: 'لطفاً وارد شوید.' });
  }
  if (user.role !== 'admin') {
    return res.status(403).json({ success: false, message: 'فقط مدیر امکان ریست دارد.' });
  }

  try {
    const users = db.users || [];
    const members = (db.members || []).map((m) => ({
      ...m,
      deposit: 0,
      loanAmount: 0,
      loanBalance: 0,
    }));

    db.users = users;
    db.members = members;
    db.payments = [];
    db.loans = [];
    db.fundLog = [];
    db.fund = [{ id: 'main', cashBalance: 0 }];
    db.loanRequests = [];
    db.receiptSubmissions = [];

    const { usePg } = require('../config');
    if (usePg) {
      await persistDb();
    } else {
      persistDb();
    }
    res.json({ success: true, message: 'دیتابیس با موفقیت ریست شد. فقط اعضا و کاربران حفظ شدند.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'خطا در ریست دیتابیس.' });
  }
});

module.exports = router;
