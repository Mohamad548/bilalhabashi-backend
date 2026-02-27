require('dotenv').config();
const express = require('express');
const jsonServer = require('json-server');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const { db, uploadsDir, receiptsDir, persistDb, usePg } = require('./config');
const persistAfterRouter = require('./middleware/persistAfterRouter');
const loansGuard = require('./middleware/loansGuard');
const authRoutes = require('./routes/auth');
const telegramRoutes = require('./routes/telegram');
const receiptSubmissionsRoutes = require('./routes/receiptSubmissions');
const resetDbRoutes = require('./routes/resetDb');
const settingsRoutes = require('./routes/settings');

let telegramBot = null;
try {
  telegramBot = require('./telegramBot');
} catch (e) {}

const { formatNumTelegram } = require('./shamsiUtils');

function formatTemplate(tpl, ctx) {
  if (!tpl || typeof tpl !== 'string') return '';
  return tpl.replace(/\{(\w+)\}/g, (m, key) => (ctx[key] != null ? String(ctx[key]) : ''));
}

const app = express();

app.use(cors());
app.use(express.json());

try {
  fs.mkdirSync(receiptsDir, { recursive: true });
} catch (e) {}
app.use('/uploads', express.static(uploadsDir));

app.use('/api', authRoutes);
app.use('/api', telegramRoutes);
app.use('/api', receiptSubmissionsRoutes);
app.use('/api', resetDbRoutes);
app.use('/api', settingsRoutes);

// ثبت پرداخت دستی (از پنل ادمین) با ارسال نوتیفیکیشن تلگرام به گروه/کانال ادمین
app.post('/api/payments', async (req, res) => {
  const body = req.body || {};
  const memberId = body.memberId != null ? String(body.memberId).trim() : '';
  const amountRaw = body.amount;
  const dateStr = body.date != null ? String(body.date).trim() : '';
  const type = body.type === 'repayment' ? 'repayment' : 'contribution';

  const amount = Number(amountRaw);
  if (!memberId || !dateStr || !amount || amount <= 0) {
    return res.status(400).json({ message: 'memberId، مبلغ و تاریخ الزامی هستند.' });
  }

  const member = (db.members || []).find((m) => String(m.id) === String(memberId));
  if (!member) {
    return res.status(404).json({ message: 'عضو یافت نشد.' });
  }

  const payments = db.payments || [];
  let newId = payments.length ? Math.max(...payments.map((p) => Number(p.id) || 0)) + 1 : 1;
  db.payments = payments;

  const createdAt = body.createdAt || new Date().toISOString();
  const payment = {
    id: newId,
    memberId,
    amount,
    date: dateStr,
    type,
    note: body.note || undefined,
    createdAt,
  };
  db.payments.push(payment);

  if (usePg) {
    try {
      await persistDb();
    } catch (e) {
      console.error('[payments] خطا در ذخیره به دیتابیس:', e.message);
    }
  } else {
    persistDb();
  }

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

  const sendManualPaymentGroup = telegramSettings.sendManualPaymentGroup !== false;
  if (telegramBot && uniqueTargets.length > 0 && sendManualPaymentGroup) {
    const memberName = member.fullName || 'عضو بدون نام';
    const amountFa = formatNumTelegram(amount);
    const baseTpl =
      telegramSettings.manualPaymentGroupTemplate ||
      '✅ پرداخت عضو «{memberName}» به مبلغ {amount} تومان در تاریخ {date} در سیستم ثبت شد.';
    const text = formatTemplate(baseTpl, { memberName, amount: amountFa, date: dateStr });
    if (text) {
      for (const targetId of uniqueTargets) {
        telegramBot.sendMessage(String(targetId), text).catch((err) => {
          console.error('[Telegram] خطا در ارسال پیام ثبت پرداخت دستی به کانال/گروه ادمین:', err.message);
        });
      }
      const notifyTarget = (telegramSettings.notifyTarget || '').trim();
      if (notifyTarget && telegramSettings.sendPaymentToAdmin !== false) {
        const adminTpl = (telegramSettings.paymentAdminTemplate || '').trim();
        const textForAdmin = adminTpl
          ? formatTemplate(adminTpl, { memberName, amount: amountFa, date: dateStr })
          : text;
        console.log('[Telegram/چت-مدیر] ارسال اعلان پرداخت دستی به چت مدیر اصلی، target:', notifyTarget.length > 4 ? notifyTarget.slice(0, 2) + '...' + notifyTarget.slice(-2) : '***');
        telegramBot.sendMessage(String(notifyTarget), textForAdmin)
          .then(() => console.log('[Telegram/چت-مدیر] اعلان پرداخت دستی به چت مدیر ارسال شد.'))
          .catch((err) => {
            console.error('[Telegram/چت-مدیر] خطا در ارسال اعلان پرداخت دستی به چت مدیر:', err.message);
          });
      } else if (!notifyTarget) {
        console.log('[Telegram/چت-مدیر] چت مدیر اصلی (notifyTarget) خالی است؛ اعلان پرداخت دستی به مدیر ارسال نمی‌شود.');
      }
    }
  }

  return res.status(201).json(payment);
});

app.post('/api/loans', loansGuard, (req, res, next) => next());

const jsonRouter = jsonServer.router(db);
const jsonMiddlewares = jsonServer.defaults({ static: path.join(__dirname, 'public') });
app.use('/api', jsonMiddlewares, persistAfterRouter, jsonRouter);

module.exports = app;
