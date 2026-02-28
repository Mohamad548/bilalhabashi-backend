-- اضافه کردن ستون note به receipt_submissions (توضیحات / افراد تحت تکفل برای پرداخت خانوادگی)
-- در دیتابیس‌هایی که قبلاً بدون این ستون ساخته شده‌اند اجرا کنید.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'sanduq_bilal_habashi'
      AND table_name = 'receipt_submissions'
      AND column_name = 'note'
  ) THEN
    ALTER TABLE sanduq_bilal_habashi.receipt_submissions ADD COLUMN note TEXT;
  END IF;
END $$;
