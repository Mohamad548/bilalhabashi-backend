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
  const adminGroupId = (telegramSettings.adminTarget || process.env.TELEGRAM_ADMIN_GROUP_ID || '').trim();
  if (telegramBot && adminGroupId) {
    const memberName = member.fullName || 'عضو بدون نام';
    const amountFa = formatNumTelegram(amount);
    const text = `✅ پرداخت عضو «${memberName}» به مبلغ ${amountFa} تومان در تاریخ ${dateStr} در سیستم ثبت شد.`;
    telegramBot.sendMessage(adminGroupId, text).catch((err) => {
      console.error('[Telegram] خطا در ارسال پیام ثبت پرداخت دستی به گروه ادمین:', err.message);
    });
  }

  return res.status(201).json(payment);
});

app.post('/api/loans', loansGuard, (req, res, next) => next());

const jsonRouter = jsonServer.router(db);
const jsonMiddlewares = jsonServer.defaults({ static: path.join(__dirname, 'public') });
app.use('/api', jsonMiddlewares, persistAfterRouter, jsonRouter);

module.exports = app;
