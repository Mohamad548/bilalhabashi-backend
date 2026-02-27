const express = require('express');
const { db, persistDb, usePg } = require('../config');

const router = express.Router();

// دریافت تنظیمات تلگرام (برای پنل ادمین)
router.get('/admin/telegram-settings', (req, res) => {
  const settings = db.telegramSettings || {};
  res.json({
    adminTarget: settings.adminTarget || '',
    adminChannelTarget: settings.adminChannelTarget || '',
    adminGroupTarget: settings.adminGroupTarget || '',
    notifyTarget: settings.notifyTarget || '',
    sendReceiptMember: settings.sendReceiptMember !== false,
    sendReceiptGroup: settings.sendReceiptGroup !== false,
    sendManualPaymentGroup: settings.sendManualPaymentGroup !== false,
    sendLoanRequestGroup: settings.sendLoanRequestGroup !== false,
    sendLoanRequestToAdmin: settings.sendLoanRequestToAdmin !== false,
    sendPaymentToAdmin: settings.sendPaymentToAdmin !== false,
    receiptMemberTemplate: settings.receiptMemberTemplate || '',
    receiptGroupTemplate: settings.receiptGroupTemplate || '',
    manualPaymentGroupTemplate: settings.manualPaymentGroupTemplate || '',
    broadcastWaitingTemplate: settings.broadcastWaitingTemplate || '',
    broadcastWaitingLineTemplate: settings.broadcastWaitingLineTemplate || '',
    loanRequestAdminTemplate: settings.loanRequestAdminTemplate || '',
    paymentAdminTemplate: settings.paymentAdminTemplate || '',
  });
});

// ذخیره تنظیمات تلگرام
router.post('/admin/telegram-settings', async (req, res) => {
  const body = req.body || {};
  const adminTarget = body.adminTarget != null ? String(body.adminTarget).trim() : '';
  const adminChannelTarget = body.adminChannelTarget != null ? String(body.adminChannelTarget).trim() : '';
  const adminGroupTarget = body.adminGroupTarget != null ? String(body.adminGroupTarget).trim() : '';
  let notifyTarget = body.notifyTarget != null ? String(body.notifyTarget).trim() : '';
  // اگر کاربر بعد از لینک (برقراری با تلگرام) بدون رفرش ذخیره کند، چت مدیر را خالی نکن
  if (!notifyTarget && db.telegramSettings && (db.telegramSettings.notifyTarget || '').trim()) {
    notifyTarget = String(db.telegramSettings.notifyTarget).trim();
    console.log('[settings] چت مدیر اصلی از مقدار قبلی (لینک) حفظ شد؛ notifyTarget=', notifyTarget ? 'تنظیم‌شده' : 'خالی');
  }
  const sendReceiptMember = body.sendReceiptMember !== false;
  const sendReceiptGroup = body.sendReceiptGroup !== false;
  const sendManualPaymentGroup = body.sendManualPaymentGroup !== false;
  const sendLoanRequestGroup = body.sendLoanRequestGroup !== false;
  const sendLoanRequestToAdmin = body.sendLoanRequestToAdmin !== false;
  const sendPaymentToAdmin = body.sendPaymentToAdmin !== false;
  const receiptMemberTemplate =
    body.receiptMemberTemplate != null ? String(body.receiptMemberTemplate) : '';
  const receiptGroupTemplate =
    body.receiptGroupTemplate != null ? String(body.receiptGroupTemplate) : '';
  const manualPaymentGroupTemplate =
    body.manualPaymentGroupTemplate != null ? String(body.manualPaymentGroupTemplate) : '';
  const broadcastWaitingTemplate =
    body.broadcastWaitingTemplate != null ? String(body.broadcastWaitingTemplate) : '';
  const broadcastWaitingLineTemplate =
    body.broadcastWaitingLineTemplate != null ? String(body.broadcastWaitingLineTemplate) : '';
  const loanRequestAdminTemplate =
    body.loanRequestAdminTemplate != null ? String(body.loanRequestAdminTemplate) : '';
  const paymentAdminTemplate =
    body.paymentAdminTemplate != null ? String(body.paymentAdminTemplate) : '';

  db.telegramSettings = {
    adminTarget,
    adminChannelTarget,
    adminGroupTarget,
    notifyTarget,
    sendReceiptMember,
    sendReceiptGroup,
    sendManualPaymentGroup,
    sendLoanRequestGroup,
    sendLoanRequestToAdmin,
    sendPaymentToAdmin,
    receiptMemberTemplate,
    receiptGroupTemplate,
    manualPaymentGroupTemplate,
    broadcastWaitingTemplate,
    broadcastWaitingLineTemplate,
    loanRequestAdminTemplate,
    paymentAdminTemplate,
  };

  try {
    if (usePg) {
      await persistDb();
    } else {
      persistDb();
    }
    console.log('[settings] تنظیمات تلگرام ذخیره شد؛ notifyTarget=', notifyTarget ? `"${notifyTarget}"` : 'خالی', ', sendLoanRequestToAdmin=', sendLoanRequestToAdmin, ', sendPaymentToAdmin=', sendPaymentToAdmin);
    console.log('[settings] loanRequestAdminTemplate طول=', (loanRequestAdminTemplate || '').length, 'کاراکتر');
    res.json({
      success: true,
      adminTarget,
      adminChannelTarget,
      adminGroupTarget,
      notifyTarget,
      sendReceiptMember,
      sendReceiptGroup,
      sendManualPaymentGroup,
      sendLoanRequestGroup,
      sendLoanRequestToAdmin,
      sendPaymentToAdmin,
      receiptMemberTemplate,
      receiptGroupTemplate,
      manualPaymentGroupTemplate,
      broadcastWaitingTemplate,
      broadcastWaitingLineTemplate,
      loanRequestAdminTemplate,
      paymentAdminTemplate,
    });
  } catch (err) {
    console.error('[settings] خطا در ذخیره تنظیمات تلگرام:', err.message);
    res.status(500).json({ success: false, message: 'خطا در ذخیره تنظیمات تلگرام.' });
  }
});

module.exports = router;

