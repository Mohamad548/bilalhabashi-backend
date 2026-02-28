/**
 * ارسال یادآوری سررسید وام به کاربران در تلگرام (بر اساس قسط ماهانه).
 * روزهای یادآوری و مقصد لیست معوقین از db.telegramSettings خوانده می‌شود.
 */
const http = require('http');
const { db, persistDb, usePg } = require('./config');
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
    const ts = db.telegramSettings || {};
    const reminderDays = Array.isArray(ts.reminderDaysBefore) && ts.reminderDaysBefore.length
      ? ts.reminderDaysBefore
      : [7, 3, 1];
    const sendReminderToMember = ts.sendReminderToMember !== false;

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

        if (sendReminderToMember) {
          const dayKey = `${diff}d`;
          if (reminderDays.includes(diff) && !getSent(loan, monthNum, dayKey)) {
            const dayLabel = diff === 1 ? 'فردا' : `${diff} روز دیگر`;
            const text = `📋 یادآوری قسط وام (ماه ${monthNum})\n\nمبلغ قسط این ماه: ${installmentFormatted} تومان.\nتاریخ سررسید این قسط ${dayLabel}، ${dueDateDisplay} می‌باشد.`;
            await telegramBot.sendMessage(String(member.telegramChatId), text).catch(() => {});
            await apiPatch('/api/loans/' + loan.id, setSent(loan, monthNum, dayKey, true)).catch(() => {});
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
    }

    // لیست معوقین: سررسید گذشته و قسط پرداخت نشده — حداکثر یک بار در روز
    const sendOverdueListToAdmin = ts.sendOverdueListToAdmin === true;
    const sendOverdueListToGroup = ts.sendOverdueListToGroup === true;
    const sendOverdueListToMember = ts.sendOverdueListToMember === true;
    if (sendOverdueListToAdmin || sendOverdueListToGroup || sendOverdueListToMember) {
      const todayKey = today;
      if ((ts.overdueListLastSentDate || '') !== todayKey) {
        const overdueItems = [];
        for (const loan of loanList) {
          const member = memberMap[loan.memberId];
          if (!member) continue;
          const dueMonths = loan.dueMonths || 0;
          if (dueMonths <= 0) continue;
          const monthlyInstallment = Math.floor((loan.amount || 0) / dueMonths);
          const totalRepaid = (loan.amount || 0) - (member.loanBalance ?? 0);
          const paidInstallments = monthlyInstallment > 0 ? Math.floor(totalRepaid / monthlyInstallment) : 0;
          for (let monthNum = 1; monthNum <= dueMonths; monthNum++) {
            if (monthNum <= paidInstallments) continue;
            const dueDateForMonth = addMonthsShamsi(loan.date, monthNum);
            if (!dueDateForMonth) continue;
            const diff = diffDaysShamsi(today, dueDateForMonth);
            if (diff !== null && diff < 0) {
              const dueDateDisplay = normalizeShamsi(dueDateForMonth).replace(/-/g, '/').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
              overdueItems.push({
                member,
                loan,
                monthNum,
                dueDateDisplay,
                installment: formatNumTelegram(monthlyInstallment),
              });
              break;
            }
          }
        }

        if (overdueItems.length > 0) {
          const lines = overdueItems.map((o) => `• ${o.member.fullName || 'نامشخص'} — قسط ماه ${o.monthNum}، سررسید ${o.dueDateDisplay} (${o.installment} تومان)`);
          const listText = `📋 لیست معوقین (سررسید گذشته، پرداخت نشده) — ${today.replace(/-/g, '/').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d])}\n\n${lines.join('\n')}`;

          const notifyTarget = (ts.notifyTarget || '').trim();
          const adminTargets = [
            ts.adminChannelTarget,
            ts.adminGroupTarget,
            ts.adminTarget,
            process.env.TELEGRAM_ADMIN_GROUP_ID,
          ].filter(Boolean).map((s) => String(s).trim()).filter(Boolean);
          const uniqueTargets = [...new Set(adminTargets)];

          if (sendOverdueListToAdmin && notifyTarget) {
            await telegramBot.sendMessage(String(notifyTarget), listText).catch((err) => console.error('[LoanReminders] خطا ارسال لیست معوقین به مدیر:', err.message));
          }
          if (sendOverdueListToGroup) {
            for (const targetId of uniqueTargets) {
              await telegramBot.sendMessage(String(targetId), listText).catch(() => {});
            }
          }
          if (sendOverdueListToMember) {
            const memberPvMsg = `📋 یادآوری: قسط وام شما سررسید گذشته و پرداخت نشده است. لطفاً از طریق گزینه «پرداخت» در ربات اقدام کنید.\nبا تشکر — مدیر صندوق`;
            for (const { member } of overdueItems) {
              if (member.telegramChatId) {
                await telegramBot.sendMessage(String(member.telegramChatId), memberPvMsg).catch(() => {});
              }
            }
          }

          if (!db.telegramSettings) db.telegramSettings = {};
          db.telegramSettings.overdueListLastSentDate = todayKey;
          try {
            if (usePg) await persistDb();
            else persistDb();
          } catch (e) {
            console.error('[LoanReminders] خطا در ذخیره overdueListLastSentDate:', e.message);
          }
        }
      }
    }
  } catch (e) {
    console.error('[LoanReminders] خطا:', e.message);
  }
}

module.exports = { runLoanReminders };
