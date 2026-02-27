const express = require('express');
const { db, persistDb, usePg } = require('../config');

const router = express.Router();

// دریافت تنظیمات تلگرام (برای پنل ادمین)
router.get('/admin/telegram-settings', (req, res) => {
  const settings = db.telegramSettings || {};
  res.json({
    adminTarget: settings.adminTarget || '',
    notifyTarget: settings.notifyTarget || '',
  });
});

// ذخیره تنظیمات تلگرام
router.post('/admin/telegram-settings', async (req, res) => {
  const body = req.body || {};
  const adminTarget = body.adminTarget != null ? String(body.adminTarget).trim() : '';
  const notifyTarget = body.notifyTarget != null ? String(body.notifyTarget).trim() : '';

  db.telegramSettings = {
    adminTarget,
    notifyTarget,
  };

  try {
    if (usePg) {
      await persistDb();
    } else {
      persistDb();
    }
    res.json({ success: true, adminTarget, notifyTarget });
  } catch (err) {
    console.error('[settings] خطا در ذخیره تنظیمات تلگرام:', err.message);
    res.status(500).json({ success: false, message: 'خطا در ذخیره تنظیمات تلگرام.' });
  }
});

module.exports = router;

