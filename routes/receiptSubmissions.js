const express = require('express');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { db, persistDb, usePg, receiptsDir } = require('../config');
const { getTelegramProxyUrl, createTelegramProxyAgent } = require('../lib/telegramProxy');
const { formatNumTelegram } = require('../shamsiUtils');

let telegramBot = null;
try {
  telegramBot = require('../telegramBot');
} catch (e) {}

const router = express.Router();

function formatTemplate(tpl, ctx) {
  if (!tpl || typeof tpl !== 'string') return '';
  return tpl.replace(/\{(\w+)\}/g, (m, key) => (ctx[key] != null ? String(ctx[key]) : ''));
}

router.get('/receiptSubmissions', (req, res) => {
  res.json(db.receiptSubmissions || []);
});

router.post('/receipt-submissions', async (req, res) => {
  const { memberId, fileId } = req.body || {};
  if (!memberId || !fileId) {
    return res.status(400).json({ message: 'memberId و fileId الزامی است.' });
  }
  const member = db.members.find((m) => String(m.id) === String(memberId));
  if (!member) {
    return res.status(404).json({ message: 'عضو یافت نشد.' });
  }
  if (!telegramBot) {
    return res.status(503).json({ message: 'ربات تلگرام غیرفعال است.' });
  }
  try {
    const file = await telegramBot.getFile(fileId);
    const filePath = file.file_path;
    if (!filePath) {
      return res.status(400).json({ message: 'فایل یافت نشد.' });
    }
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const id = String(Date.now());
    const ext = path.extname(filePath) || '.jpg';
    const destFileName = id + ext;
    const destPath = path.join(receiptsDir, destFileName);
    const downloadUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    await new Promise((resolve, reject) => {
      const proxyUrl = getTelegramProxyUrl();
      const options = new URL(downloadUrl);
      const requestOptions = { hostname: options.hostname, path: options.pathname + options.search, method: 'GET' };
      if (proxyUrl) {
        requestOptions.agent = createTelegramProxyAgent(proxyUrl);
      }
      const reqTelegram = https.request(requestOptions, (apiRes) => {
        const out = fs.createWriteStream(destPath);
        apiRes.pipe(out);
        out.on('finish', () => { out.close(); resolve(); });
      });
      reqTelegram.on('error', reject);
      reqTelegram.end();
    });
    db.receiptSubmissions = db.receiptSubmissions || [];
    const record = {
      id,
      memberId: String(member.id),
      memberName: member.fullName || 'نامشخص',
      imagePath: 'receipts/' + destFileName,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    db.receiptSubmissions.push(record);
    if (usePg) await persistDb(); else persistDb();
    res.json(record);
  } catch (err) {
    console.error('[receipt-submissions] خطا:', err.message);
    res.status(500).json({ message: 'خطا در ذخیره رسید: ' + err.message });
  }
});

router.post('/receipt-submissions/:id/approve', async (req, res) => {
  const id = req.params.id;
  const list = db.receiptSubmissions || [];
  const index = list.findIndex((r) => String(r.id) === String(id));
  if (index === -1) {
    return res.status(404).json({ message: 'درخواست رسید یافت نشد.' });
  }
  const rec = list[index];
  if (rec.status !== 'pending') {
    return res.status(400).json({ message: 'این درخواست قبلاً تایید یا رد شده است.' });
  }
  const member = db.members.find((m) => String(m.id) === String(rec.memberId));
  if (!member) {
    return res.status(404).json({ message: 'عضو یافت نشد.' });
  }
  const amount = Number(req.body && req.body.amount);
  const dateStr = (req.body && req.body.date) ? String(req.body.date).trim() : '';
  const typeRaw = req.body && req.body.type;
  const type = typeRaw === 'contribution_repayment' ? 'contribution_repayment' : (typeRaw === 'repayment' ? 'repayment' : 'contribution');

  if (amount <= 0 || !dateStr) {
    return res.status(400).json({ message: 'مبلغ و تاریخ پرداخت الزامی است.' });
  }

  const payments = db.payments || [];
  let payId = payments.length ? Math.max(...payments.map((p) => Number(p.id) || 0)) + 1 : 1;
  const receiptImagePath = rec.imagePath || '';
  db.payments = db.payments || [];

  const pushPayment = (payload) => {
    db.payments.push({
      id: payId++,
      memberId: rec.memberId,
      createdAt: new Date().toISOString(),
      receiptImagePath: receiptImagePath || undefined,
      ...payload,
    });
  };

  if (type === 'contribution_repayment') {
    const activeLoan = (db.loans || []).find(
      (l) => String(l.memberId) === String(rec.memberId) && (l.status === 'active' || l.status == null)
    );
    if (!activeLoan || !activeLoan.dueMonths) {
      return res.status(400).json({ message: 'این عضو وام فعال ندارد. نوع «سپرده / قسط ماهانه» قابل انتخاب نیست.' });
    }
    const installment = Math.floor((activeLoan.amount || 0) / activeLoan.dueMonths);
    if (amount < installment) {
      return res.status(400).json({ message: 'مبلغ نباید کمتر از قسط ماهانه باشد.' });
    }
    const contributionAmount = amount - installment;
    pushPayment({
      amount: installment,
      date: dateStr,
      type: 'repayment',
      note: 'واریز از طریق رسید تلگرام (تایید ادمین) — قسط',
    });
    if (contributionAmount > 0) {
      pushPayment({
        amount: contributionAmount,
        date: dateStr,
        type: 'contribution',
        note: 'واریز از طریق رسید تلگرام (تایید ادمین) — سپرده',
      });
    }
    member.loanBalance = Math.max(0, (member.loanBalance || 0) - installment);
    member.deposit = (member.deposit || 0) + contributionAmount;
  } else if (type === 'repayment') {
    const loanBal = member.loanBalance || 0;
    if (amount > loanBal && loanBal > 0) {
      pushPayment({
        amount: loanBal,
        date: dateStr,
        type: 'repayment',
        note: 'واریز از طریق رسید تلگرام (تایید ادمین) — بازپرداخت وام',
      });
      pushPayment({
        amount: amount - loanBal,
        date: dateStr,
        type: 'contribution',
        note: 'واریز از طریق رسید تلگرام (تایید ادمین) — مازاد وام به سپرده',
      });
      member.loanBalance = 0;
      member.deposit = (member.deposit || 0) + (amount - loanBal);
    } else {
      pushPayment({
        amount,
        date: dateStr,
        type: 'repayment',
        note: 'واریز از طریق رسید تلگرام (تایید ادمین)',
      });
      member.loanBalance = Math.max(0, loanBal - amount);
    }
  } else {
    pushPayment({
      amount,
      date: dateStr,
      type: 'contribution',
      note: 'واریز از طریق رسید تلگرام (تایید ادمین)',
    });
    member.deposit = (member.deposit || 0) + amount;
  }

  rec.status = 'approved';
  rec.approvedAt = new Date().toISOString();
  if (usePg) await persistDb(); else persistDb();

  const chatId = member.telegramChatId;
  const telegramSettings = db.telegramSettings || {};
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

  const memberName = rec.memberName || member.fullName || 'عضو بدون نام';
  const amountFa = formatNumTelegram(amount);

  const baseMemberTpl =
    telegramSettings.receiptMemberTemplate ||
    'پرداخت شما به مبلغ {amount} تومان در تاریخ {date} در سیستم ثبت شد.';
  const baseGroupTpl =
    telegramSettings.receiptGroupTemplate ||
    '✅ پرداخت عضو «{memberName}» به مبلغ {amount} تومان در تاریخ {date} در سیستم ثبت شد.';

  const ctx = { memberName, amount: amountFa, date: dateStr };
  const textForMember = formatTemplate(baseMemberTpl, ctx);
  const textForGroup = formatTemplate(baseGroupTpl, ctx);

  const sendReceiptMember = telegramSettings.sendReceiptMember !== false;
  const sendReceiptGroup = telegramSettings.sendReceiptGroup !== false;

  if (telegramBot && chatId && sendReceiptMember && textForMember) {
    telegramBot.sendMessage(String(chatId), textForMember).catch((err) => {
      console.error('[Telegram] خطا در ارسال پیام به عضو:', err.message);
    });
  }
  if (telegramBot && sendReceiptGroup && textForGroup) {
    for (const targetId of uniqueTargets) {
      telegramBot.sendMessage(String(targetId), textForGroup).catch((err) => {
        console.error('[Telegram] خطا در ارسال پیام به کانال/گروه ادمین:', err.message);
      });
    }
  }
  const notifyTarget = (telegramSettings.notifyTarget || '').trim();
  if (telegramBot && notifyTarget && telegramSettings.sendPaymentToAdmin !== false) {
    const adminTpl = (telegramSettings.paymentAdminTemplate || '').trim();
    const textForAdmin = adminTpl
      ? formatTemplate(adminTpl, ctx)
      : ((sendReceiptGroup && textForGroup) ? textForGroup : (sendReceiptMember && textForMember ? textForMember : null));
    if (textForAdmin) {
      console.log('[Telegram/چت-مدیر] ارسال اعلان پرداخت (رسید) به چت مدیر اصلی، target:', notifyTarget.length > 4 ? notifyTarget.slice(0, 2) + '...' + notifyTarget.slice(-2) : '***');
      telegramBot.sendMessage(String(notifyTarget), textForAdmin)
        .then(() => console.log('[Telegram/چت-مدیر] اعلان پرداخت به چت مدیر ارسال شد.'))
        .catch((err) => {
          console.error('[Telegram/چت-مدیر] خطا در ارسال اعلان پرداخت به چت مدیر:', err.message);
        });
    }
  } else if (telegramBot && !notifyTarget) {
    console.log('[Telegram/چت-مدیر] چت مدیر اصلی (notifyTarget) خالی است؛ اعلان پرداخت به مدیر ارسال نمی‌شود.');
  }
  res.json({ success: true, message: 'تایید شد.' });
});

router.post('/receipt-submissions/:id/reject', async (req, res) => {
  const id = req.params.id;
  const list = db.receiptSubmissions || [];
  const index = list.findIndex((r) => String(r.id) === String(id));
  if (index === -1) {
    return res.status(404).json({ message: 'درخواست رسید یافت نشد.' });
  }
  const rec = list[index];
  if (rec.status !== 'pending') {
    return res.status(400).json({ message: 'این درخواست قبلاً تایید یا رد شده است.' });
  }
  const member = db.members.find((m) => String(m.id) === String(rec.memberId));
  if (!member) {
    return res.status(404).json({ message: 'عضو یافت نشد.' });
  }
  const message = (req.body && req.body.message) ? String(req.body.message).trim() : 'رسید شما تأیید نشد. در صورت نیاز مجدداً ارسال کنید.';
  rec.status = 'rejected';
  rec.rejectedAt = new Date().toISOString();
  rec.rejectMessage = message;
  if (usePg) await persistDb(); else persistDb();

  const chatId = member.telegramChatId;
  if (telegramBot && chatId) {
    const text = '❌ رسید پرداخت شما تأیید نشد.\n\n' + message;
    telegramBot.sendMessage(String(chatId), text).catch((err) => {
      console.error('[Telegram] خطا در ارسال پیام رد رسید:', err.message);
    });
  }
  res.json({ success: true, message: 'رد شد و پیام به عضو ارسال شد.' });
});

module.exports = router;
