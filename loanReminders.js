/**
 * ارسال یادآوری سررسید وام به کاربران در تلگرام (بر اساس قسط ماهانه):
 * برای هر ماه وام: ۷ روز قبل، ۳ روز قبل، ۱ روز قبل، و در روز سررسید آن قسط دو بار با فاصله ۴ ساعت
 */
const http = require('http');
const {
  addMonthsShamsi,
  todayShamsi,
  diffDaysShamsi,
  normalizeShamsi,
  formatNumTelegram,
} = require('./shamsiUtils');

const API_PORT = process.env.PORT || 3001;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

function apiGet(path) {
  return new Promise((resolve, reject) => {
    http.get(API_BASE + path, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function apiPatch(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const postData = JSON.stringify(body);
    const opt = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    };
    const req = http.request(opt, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          resolve({});
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/** یادآوری‌های ارسال‌شده به ازای هر قسط: reminderSent['m1-7d'], ['m1-3d'], ['m1-1d'], ['m1-due'], ['m1-dueFirstAt'] */
function getSent(loan, monthNum, type) {
  const sent = loan.reminderSent || {};
  const key = `m${monthNum}-${type}`;
  return sent[key];
}

function setSent(loan, monthNum, type, value) {
  const sent = { ...(loan.reminderSent || {}) };
  const key = `m${monthNum}-${type}`;
  sent[key] = value;
  return { ...loan, reminderSent: sent };
}

async function runLoanReminders(telegramBot) {
  if (!telegramBot) return;
  try {
    const [loans, members] = await Promise.all([
      apiGet('/api/loans'),
      apiGet('/api/members'),
    ]);
    const loanList = Array.isArray(loans) ? loans.filter((l) => l.status === 'active') : [];
    const memberMap = {};
    (Array.isArray(members) ? members : []).forEach((m) => { memberMap[m.id] = m; });

    const today = todayShamsi();

    for (const loan of loanList) {
      const member = memberMap[loan.memberId];
      if (!member || !member.telegramChatId) continue;

      const dueMonths = loan.dueMonths || 0;
      if (dueMonths <= 0) continue;

      const monthlyInstallment = Math.floor((loan.amount || 0) / dueMonths);
      const totalRepaid = (loan.amount || 0) - (member.loanBalance ?? 0);
      const paidInstallments = monthlyInstallment > 0 ? Math.floor(totalRepaid / monthlyInstallment) : 0;
      const installmentFormatted = formatNumTelegram(monthlyInstallment);

      for (let monthNum = 1; monthNum <= dueMonths; monthNum++) {
        if (monthNum <= paidInstallments) continue;

        const dueDateForMonth = addMonthsShamsi(loan.date, monthNum);
        if (!dueDateForMonth) continue;

        const diff = diffDaysShamsi(today, dueDateForMonth);
        if (diff === null) continue;

        const dueDateDisplay = normalizeShamsi(dueDateForMonth).replace(/-/g, '/').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

        if (diff === 7 && !getSent(loan, monthNum, '7d')) {
          const text = `📋 یادآوری قسط وام (ماه ${monthNum})\n\nمبلغ قسط این ماه: ${installmentFormatted} تومان.\nتاریخ سررسید این قسط ۷ روز دیگر، ${dueDateDisplay} می‌باشد.`;
          await telegramBot.sendMessage(String(member.telegramChatId), text).catch(() => {});
          await apiPatch('/api/loans/' + loan.id, setSent(loan, monthNum, '7d', true)).catch(() => {});
        } else if (diff === 3 && !getSent(loan, monthNum, '3d')) {
          const text = `📋 یادآوری قسط وام (ماه ${monthNum})\n\nمبلغ قسط این ماه: ${installmentFormatted} تومان.\nتاریخ سررسید این قسط ۳ روز دیگر، ${dueDateDisplay} می‌باشد.`;
          await telegramBot.sendMessage(String(member.telegramChatId), text).catch(() => {});
          await apiPatch('/api/loans/' + loan.id, setSent(loan, monthNum, '3d', true)).catch(() => {});
        } else if (diff === 1 && !getSent(loan, monthNum, '1d')) {
          const text = `📋 یادآوری قسط وام (ماه ${monthNum})\n\nمبلغ قسط این ماه: ${installmentFormatted} تومان.\nتاریخ سررسید این قسط فردا، ${dueDateDisplay} می‌باشد.`;
          await telegramBot.sendMessage(String(member.telegramChatId), text).catch(() => {});
          await apiPatch('/api/loans/' + loan.id, setSent(loan, monthNum, '1d', true)).catch(() => {});
        } else if (diff === 0) {
          const dueMsg = `📋 امروز تاریخ سررسید قسط ماه ${monthNum} وام شماست (${installmentFormatted} تومان).\n\nاز طریق گزینه «پرداخت» جهت پرداخت اقدام کنید.\nبا تشکر — مدیر صندوق`;
          const count = getSent(loan, monthNum, 'due') || 0;
          const firstSentAt = getSent(loan, monthNum, 'dueFirstAt');
          const firstTime = firstSentAt ? new Date(firstSentAt).getTime() : 0;
          const fourHours = 4 * 60 * 60 * 1000;

          if (count === 0) {
            await telegramBot.sendMessage(String(member.telegramChatId), dueMsg).catch(() => {});
            await apiPatch('/api/loans/' + loan.id, setSent(setSent(loan, monthNum, 'due', 1), monthNum, 'dueFirstAt', new Date().toISOString())).catch(() => {});
          } else if (count === 1 && Date.now() - firstTime >= fourHours) {
            await telegramBot.sendMessage(String(member.telegramChatId), dueMsg).catch(() => {});
            await apiPatch('/api/loans/' + loan.id, setSent(loan, monthNum, 'due', 2)).catch(() => {});
          }
        }
      }
    }
  } catch (e) {
    console.error('[LoanReminders] خطا:', e.message);
  }
}

module.exports = { runLoanReminders };
