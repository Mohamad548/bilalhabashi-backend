/**
 * پاک‌سازی دیتابیس واقعی Neon (PostgreSQL) — فقط اعضا و کاربران حفظ می‌شوند.
 *
 * نگه می‌دارد: users, members (همه رکوردها)
 * خالی می‌کند: payments, loans, fund_log, loan_requests, receipt_submissions
 * ریست می‌کند: fund (cash_balance = 0 برای main)، و برای هر عضو: deposit, loan_amount, loan_balance = 0
 *
 * نیاز: DATABASE_URL در .env (پوشه backend)
 * اجرا: از پوشه backend
 *   node scripts/clear-neon-except-members.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Client } = require('pg');

const SCHEMA = 'sanduq_bilal_habashi';

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('متغیر DATABASE_URL در .env تنظیم نشده است.');
    process.exit(1);
  }

  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query('BEGIN');

    // خالی کردن جداول (ترتیب با توجه به وابستگی‌ها)
    await client.query(`DELETE FROM ${SCHEMA}.payments`);
    await client.query(`DELETE FROM ${SCHEMA}.loans`);
    await client.query(`DELETE FROM ${SCHEMA}.fund_log`);
    await client.query(`DELETE FROM ${SCHEMA}.loan_requests`);
    await client.query(`DELETE FROM ${SCHEMA}.receipt_submissions`);

    // صفر کردن مبالغ اعضا
    await client.query(
      `UPDATE ${SCHEMA}.members SET deposit = 0, loan_amount = 0, loan_balance = 0`
    );

    // ریست موجودی صندوق (درج یا به‌روزرسانی main)
    await client.query(
      `INSERT INTO ${SCHEMA}.fund (id, cash_balance) VALUES ('main', 0)
       ON CONFLICT (id) DO UPDATE SET cash_balance = 0`
    );

    await client.query('COMMIT');
    console.log('دیتابیس Neon پاک شد. فقط users و members (با مبالغ صفر) حفظ شدند.');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('خطا:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
