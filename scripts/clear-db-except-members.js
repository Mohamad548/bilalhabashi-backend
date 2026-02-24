/**
 * اسکریپت پاک‌سازی دیتابیس — فقط اطلاعات اولیه اعضا و کاربران حفظ می‌شود.
 *
 * نگه می‌دارد: users, members
 * خالی می‌کند: payments, loans, fundLog, loanRequests, receiptSubmissions
 * ریست می‌کند: fund به [{ id: 'main', cashBalance: 0 }]
 * برای هر عضو: deposit, loanAmount, loanBalance را صفر می‌کند.
 *
 * اجرا: از پوشه backend
 *   node scripts/clear-db-except-members.js
 */

const path = require('path');
const fs = require('fs');

const rootDir = path.join(__dirname, '..');
const dbPath = path.join(rootDir, 'db.json');

function main() {
  if (!fs.existsSync(dbPath)) {
    console.error('فایل db.json یافت نشد:', dbPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(dbPath, 'utf8');
  const db = JSON.parse(raw);

  // نگه داشتن users و members
  const users = db.users || [];
  let members = db.members || [];

  // صفر کردن مبالغ وام/سپرده برای هر عضو
  members = members.map((m) => ({
    ...m,
    deposit: 0,
    loanAmount: 0,
    loanBalance: 0,
  }));

  const cleared = {
    users,
    members,
    payments: [],
    loans: [],
    fundLog: [],
    fund: [{ id: 'main', cashBalance: 0 }],
    loanRequests: [],
    receiptSubmissions: [],
  };

  fs.writeFileSync(dbPath, JSON.stringify(cleared, null, 2), 'utf8');
  console.log('دیتابیس پاک شد. فقط users و members (با مبالغ صفر) حفظ شدند.');
  console.log('  users:', users.length);
  console.log('  members:', members.length);
}

main();
