# اسکریپت‌های بک‌اند

## راه‌اندازی دیتابیس Neon

برای اینکه جداول این پروژه با دیتابیس سایر پروژه‌ها در یک کلستر Neon قاطی نشوند، همه جداول داخل **اسکیمای `sanduq_bilal_habashi`** ساخته می‌شوند.

### مراحل

1. در [Neon Console](https://console.neon.tech) پروژه و دیتابیس خود را انتخاب کنید.
2. به **SQL Editor** بروید.
3. محتوای فایل `neon-init.sql` را کپی کرده و در ادیتور اجرا کنید (Run).

پس از اجرا، اسکیما و جداول زیر ایجاد می‌شوند:

- `sanduq_bilal_habashi.users`
- `sanduq_bilal_habashi.members`
- `sanduq_bilal_habashi.payments`
- `sanduq_bilal_habashi.loans`
- `sanduq_bilal_habashi.fund_log`
- `sanduq_bilal_habashi.fund`
- `sanduq_bilal_habashi.loan_requests`
- `sanduq_bilal_habashi.receipt_submissions`

در صورت اتصال بعدی بک‌اند به PostgreSQL/Neon، باید در کانفیگ و کوئری‌ها از همین اسکیما و نام جداول استفاده شود.
