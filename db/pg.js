/**
 * لایه اتصال به PostgreSQL (Neon) — بارگذاری و ذخیره کل دیتا از/به اسکیمای sanduq_bilal_habashi
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const SCHEMA = 'sanduq_bilal_habashi';
let pool = null;

function getPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

/** تبدیل آرایه ردیف‌های DB به آرایه آبجکت با کلید camelCase */
function rowToMember(r) {
  if (!r) return null;
  return {
    id: r.id,
    fullName: r.full_name,
    phone: r.phone,
    nationalId: r.national_id,
    joinDate: r.join_date,
    monthlyAmount: Number(r.monthly_amount) || 0,
    status: r.status || 'active',
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    loanAmount: Number(r.loan_amount) || 0,
    deposit: Number(r.deposit) || 0,
    loanBalance: Number(r.loan_balance) || 0,
    telegramChatId: r.telegram_chat_id || undefined,
  };
}

function rowToPayment(r) {
  if (!r) return null;
  return {
    id: r.id,
    memberId: r.member_id,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    receiptImagePath: r.receipt_image_path || undefined,
    amount: Number(r.amount) || 0,
    date: r.date || undefined,
    type: r.type || undefined,
    note: r.note || undefined,
  };
}

function rowToLoan(r) {
  if (!r) return null;
  const loan = {
    id: r.id,
    memberId: r.member_id,
    amount: Number(r.amount) || 0,
    date: r.date || undefined,
    dueMonths: r.due_months != null ? Number(r.due_months) : undefined,
    status: r.status || 'active',
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
  };
  if (r.reminder_sent && typeof r.reminder_sent === 'object') loan.reminderSent = r.reminder_sent;
  else if (typeof r.reminder_sent === 'string') try { loan.reminderSent = JSON.parse(r.reminder_sent) || {}; } catch (_) { loan.reminderSent = {}; }
  else loan.reminderSent = {};
  return loan;
}

function rowToFundLog(r) {
  if (!r) return null;
  return {
    id: r.id,
    type: r.type,
    amount: Number(r.amount) || 0,
    note: r.note,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
  };
}

function rowToFund(r) {
  if (!r) return null;
  return { id: r.id, cashBalance: Number(r.cash_balance) || 0 };
}

function rowToLoanRequest(r) {
  if (!r) return null;
  return {
    id: r.id,
    telegramChatId: r.telegram_chat_id || undefined,
    userName: r.user_name || undefined,
    status: r.status || 'pending',
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
  };
}

function rowToReceiptSubmission(r) {
  if (!r) return null;
  return {
    id: r.id,
    memberId: r.member_id,
    memberName: r.member_name || undefined,
    imagePath: r.image_path || undefined,
    status: r.status || 'pending',
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : undefined,
    rejectedAt: r.rejected_at ? new Date(r.rejected_at).toISOString() : undefined,
    rejectMessage: r.reject_message || undefined,
  };
}

/**
 * بارگذاری کل دیتا از PostgreSQL و برگرداندن آبجکت به شکل db (مثل db.json)
 */
async function loadFromPg() {
  const p = getPool();
  if (!p) return null;

  const client = await p.connect();
  try {
    const [usersRes, membersRes, paymentsRes, loansRes, fundLogRes, fundRes, loanRequestsRes, receiptSubmissionsRes] = await Promise.all([
      client.query(`SELECT id, username, password, name, role, avatar FROM ${SCHEMA}.users ORDER BY id`),
      client.query(`SELECT * FROM ${SCHEMA}.members ORDER BY id`),
      client.query(`SELECT * FROM ${SCHEMA}.payments ORDER BY id`),
      client.query(`SELECT * FROM ${SCHEMA}.loans ORDER BY id`),
      client.query(`SELECT * FROM ${SCHEMA}.fund_log ORDER BY id`),
      client.query(`SELECT * FROM ${SCHEMA}.fund ORDER BY id`),
      client.query(`SELECT * FROM ${SCHEMA}.loan_requests ORDER BY id`),
      client.query(`SELECT * FROM ${SCHEMA}.receipt_submissions ORDER BY id`),
    ]);

    const users = usersRes.rows.map((r) => ({
      id: r.id,
      username: r.username,
      password: r.password,
      name: r.name,
      role: r.role,
      avatar: r.avatar,
    }));
    const members = membersRes.rows.map(rowToMember);
    const payments = paymentsRes.rows.map(rowToPayment);
    const loans = loansRes.rows.map(rowToLoan);
    const fundLog = fundLogRes.rows.map(rowToFundLog);
    const fund = fundRes.rows.map(rowToFund);
    const loanRequests = loanRequestsRes.rows.map(rowToLoanRequest);
    const receiptSubmissions = receiptSubmissionsRes.rows.map(rowToReceiptSubmission);

    return {
      users,
      members,
      payments,
      loans,
      fundLog,
      fund: fund.length ? fund : [{ id: 'main', cashBalance: 0 }],
      loanRequests,
      receiptSubmissions,
    };
  } finally {
    client.release();
  }
}

/**
 * ذخیره کل آبجکت db در PostgreSQL (جایگزینی هر جدول)
 */
async function saveToPg(db) {
  const p = getPool();
  if (!p) return;

  const client = await p.connect();
  try {
    await client.query('BEGIN');

    // ترتیب حذف با توجه به FK: ابتدا وابسته‌ها
    await client.query(`DELETE FROM ${SCHEMA}.payments`);
    await client.query(`DELETE FROM ${SCHEMA}.loans`);
    await client.query(`DELETE FROM ${SCHEMA}.fund_log`);
    await client.query(`DELETE FROM ${SCHEMA}.loan_requests`);
    await client.query(`DELETE FROM ${SCHEMA}.receipt_submissions`);
    await client.query(`DELETE FROM ${SCHEMA}.members`);
    await client.query(`DELETE FROM ${SCHEMA}.users`);
    await client.query(`DELETE FROM ${SCHEMA}.fund`);

    const users = db.users || [];
    const members = db.members || [];
    const payments = db.payments || [];
    const loans = db.loans || [];
    const fundLog = db.fundLog || [];
    const fund = db.fund && db.fund.length ? db.fund : [{ id: 'main', cashBalance: 0 }];
    const loanRequests = db.loanRequests || [];
    const receiptSubmissions = db.receiptSubmissions || [];

    for (const u of users) {
      await client.query(
        `INSERT INTO ${SCHEMA}.users (id, username, password, name, role, avatar) VALUES ($1, $2, $3, $4, $5, $6)`,
        [u.id, u.username || '', u.password || '', u.name || null, u.role || null, u.avatar || null]
      );
    }
    for (const m of members) {
      await client.query(
        `INSERT INTO ${SCHEMA}.members (id, full_name, phone, national_id, join_date, monthly_amount, status, created_at, loan_amount, deposit, loan_balance, telegram_chat_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9, $10, $11, $12)`,
        [
          m.id,
          m.fullName || null,
          m.phone || null,
          m.nationalId || null,
          m.joinDate || null,
          Number(m.monthlyAmount) || 0,
          m.status || 'active',
          m.createdAt || null,
          Number(m.loanAmount) || 0,
          Number(m.deposit) || 0,
          Number(m.loanBalance) || 0,
          m.telegramChatId || null,
        ]
      );
    }
    for (const pay of payments) {
      await client.query(
        `INSERT INTO ${SCHEMA}.payments (id, member_id, created_at, receipt_image_path, amount, date, type, note)
         VALUES ($1, $2, $3::timestamptz, $4, $5, $6, $7, $8)`,
        [
          pay.id,
          pay.memberId,
          pay.createdAt || null,
          pay.receiptImagePath || null,
          Number(pay.amount) || 0,
          pay.date || null,
          pay.type || null,
          pay.note || null,
        ]
      );
    }
    for (const loan of loans) {
      const reminderSent = loan.reminderSent && typeof loan.reminderSent === 'object' ? JSON.stringify(loan.reminderSent) : '{}';
      await client.query(
        `INSERT INTO ${SCHEMA}.loans (id, member_id, amount, date, due_months, status, created_at, reminder_sent)
         VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::jsonb)`,
        [
          loan.id,
          loan.memberId,
          Number(loan.amount) || 0,
          loan.date || null,
          loan.dueMonths != null ? Number(loan.dueMonths) : null,
          loan.status || 'active',
          loan.createdAt || null,
          reminderSent,
        ]
      );
    }
    for (const e of fundLog) {
      await client.query(
        `INSERT INTO ${SCHEMA}.fund_log (id, type, amount, note, created_at) VALUES ($1, $2, $3, $4, $5::timestamptz)`,
        [e.id, e.type || null, Number(e.amount) || 0, e.note || null, e.createdAt || null]
      );
    }
    for (const f of fund) {
      await client.query(
        `INSERT INTO ${SCHEMA}.fund (id, cash_balance) VALUES ($1, $2)`,
        [f.id, Number(f.cashBalance) || 0]
      );
    }
    for (const lr of loanRequests) {
      await client.query(
        `INSERT INTO ${SCHEMA}.loan_requests (id, telegram_chat_id, user_name, status, created_at)
         VALUES ($1, $2, $3, $4, $5::timestamptz)`,
        [lr.id, lr.telegramChatId || null, lr.userName || null, lr.status || 'pending', lr.createdAt || null]
      );
    }
    for (const rs of receiptSubmissions) {
      await client.query(
        `INSERT INTO ${SCHEMA}.receipt_submissions (id, member_id, member_name, image_path, status, created_at, approved_at, rejected_at, reject_message)
         VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8::timestamptz, $9)`,
        [
          rs.id,
          rs.memberId,
          rs.memberName || null,
          rs.imagePath || null,
          rs.status || 'pending',
          rs.createdAt || null,
          rs.approvedAt || null,
          rs.rejectedAt || null,
          rs.rejectMessage || null,
        ]
      );
    }

    // به‌روزرسانی سکانس‌ها برای idهای عددی
    const seqs = [
      ['payments', payments],
      ['loans', loans],
      ['fund_log', fundLog],
      ['loan_requests', loanRequests],
    ];
    for (const [table, arr] of seqs) {
      if (arr.length > 0) {
        const maxId = Math.max(...arr.map((x) => (typeof x.id === 'number' ? x.id : parseInt(String(x.id), 10) || 0)));
        if (maxId > 0) {
          await client.query(`SELECT setval(pg_get_serial_sequence('${SCHEMA}.${table}', 'id'), $1)`, [maxId]).catch(() => {});
        }
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * درج کاربر ادمین پیش‌فرض در صورت نبودن (بدون خطای duplicate key)
 */
async function ensureDefaultAdmin(admin) {
  const p = getPool();
  if (!p || !admin) return;
  const client = await p.connect();
  try {
    await client.query(
      `INSERT INTO ${SCHEMA}.users (id, username, password, name, role, avatar)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        admin.id,
        admin.username || '',
        admin.password || '',
        admin.name || null,
        admin.role || null,
        admin.avatar || null,
      ]
    );
  } finally {
    client.release();
  }
}

module.exports = { getPool, loadFromPg, saveToPg, ensureDefaultAdmin };
