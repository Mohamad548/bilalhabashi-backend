-- پاک‌سازی دیتابیس Neon — فقط اعضا و کاربران حفظ می‌شوند.
-- این فایل را در کنسول Neon > SQL Editor کپی کرده و Run کنید.

BEGIN;

-- خالی کردن جداول
DELETE FROM sanduq_bilal_habashi.payments;
DELETE FROM sanduq_bilal_habashi.loans;
DELETE FROM sanduq_bilal_habashi.fund_log;
DELETE FROM sanduq_bilal_habashi.loan_requests;
DELETE FROM sanduq_bilal_habashi.receipt_submissions;

-- صفر کردن مبالغ اعضا
UPDATE sanduq_bilal_habashi.members
SET deposit = 0, loan_amount = 0, loan_balance = 0;

-- ریست موجودی صندوق
INSERT INTO sanduq_bilal_habashi.fund (id, cash_balance) VALUES ('main', 0)
ON CONFLICT (id) DO UPDATE SET cash_balance = 0;

COMMIT;
