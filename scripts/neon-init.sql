-- =============================================================================
-- اسکریپت راه‌اندازی دیتابیس پروژه صندوق بلال حبشی در Neon (PostgreSQL)
-- تمام جداول داخل اسکیمای sanduq_bilal_habashi ساخته می‌شوند تا با
-- دیتابیس سایر پروژه‌ها در یک کلستر Neon قاطی نشوند.
--
-- نحوه استفاده: در کنسول Neon (SQL Editor) این فایل را اجرا کنید.
-- =============================================================================

-- ایجاد اسکیما مخصوص این پروژه
CREATE SCHEMA IF NOT EXISTS sanduq_bilal_habashi;

-- جدول کاربران (ادمین)
CREATE TABLE IF NOT EXISTS sanduq_bilal_habashi.users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  name TEXT,
  role TEXT,
  avatar TEXT
);

-- جدول اعضا
CREATE TABLE IF NOT EXISTS sanduq_bilal_habashi.members (
  id TEXT PRIMARY KEY,
  full_name TEXT,
  phone TEXT,
  national_id TEXT,
  join_date TEXT,
  monthly_amount BIGINT DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ,
  loan_amount BIGINT DEFAULT 0,
  deposit BIGINT DEFAULT 0,
  loan_balance BIGINT DEFAULT 0,
  telegram_chat_id TEXT
);

-- جدول پرداخت‌ها
CREATE TABLE IF NOT EXISTS sanduq_bilal_habashi.payments (
  id SERIAL PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES sanduq_bilal_habashi.members(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ,
  receipt_image_path TEXT,
  amount BIGINT NOT NULL,
  date TEXT,
  type TEXT,
  note TEXT
);

-- جدول وام‌ها
CREATE TABLE IF NOT EXISTS sanduq_bilal_habashi.loans (
  id SERIAL PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES sanduq_bilal_habashi.members(id) ON DELETE CASCADE,
  amount BIGINT NOT NULL,
  date TEXT,
  due_months INTEGER,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ
);

-- جدول لاگ صندوق (برای آینده)
CREATE TABLE IF NOT EXISTS sanduq_bilal_habashi.fund_log (
  id SERIAL PRIMARY KEY,
  type TEXT,
  amount BIGINT,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- جدول موجودی صندوق
CREATE TABLE IF NOT EXISTS sanduq_bilal_habashi.fund (
  id TEXT PRIMARY KEY,
  cash_balance BIGINT DEFAULT 0
);

-- جدول درخواست‌های وام (از ربات تلگرام)
CREATE TABLE IF NOT EXISTS sanduq_bilal_habashi.loan_requests (
  id SERIAL PRIMARY KEY,
  telegram_chat_id TEXT,
  user_name TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ
);

-- جدول ارسال رسیدها (تأیید/رد توسط ادمین)
CREATE TABLE IF NOT EXISTS sanduq_bilal_habashi.receipt_submissions (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL,
  member_name TEXT,
  image_path TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  rejected_at TIMESTAMPTZ,
  reject_message TEXT
);

-- ایندکس برای جستجوی سریع‌تر
CREATE INDEX IF NOT EXISTS idx_payments_member_id ON sanduq_bilal_habashi.payments(member_id);
CREATE INDEX IF NOT EXISTS idx_loans_member_id ON sanduq_bilal_habashi.loans(member_id);
CREATE INDEX IF NOT EXISTS idx_receipt_submissions_member_id ON sanduq_bilal_habashi.receipt_submissions(member_id);
CREATE INDEX IF NOT EXISTS idx_receipt_submissions_status ON sanduq_bilal_habashi.receipt_submissions(status);

-- درج رکورد پیش‌فرض صندوق (در صورت خالی بودن)
INSERT INTO sanduq_bilal_habashi.fund (id, cash_balance)
VALUES ('main', 0)
ON CONFLICT (id) DO NOTHING;
