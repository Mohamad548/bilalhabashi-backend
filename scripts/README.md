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

---

## پاک‌سازی دیتابیس (فقط db.json)

اسکریپت `clear-db-except-members.js` کل دیتابیس را خالی می‌کند **به‌جز** لیست اعضا و کاربران. وام‌ها، پرداخت‌ها، لاگ صندوق، درخواست‌های وام و رسیدها پاک می‌شوند؛ برای هر عضو هم `deposit`، `loanAmount` و `loanBalance` صفر می‌شود.

**اجرا** (از پوشه `backend`):

```bash
node scripts/clear-db-except-members.js
```

**توجه:** قبل از اجرا سرور را متوقف کنید تا تداخلی با ذخیره‌سازی پیش نیاید.

---

## پاک‌سازی دیتابیس واقعی (Neon / PostgreSQL)

اسکریپت `clear-neon-except-members.js` همان کار را روی **دیتابیس واقعی** (کنسول Neon / PostgreSQL دپلو شده) انجام می‌دهد: فقط **users** و **members** حفظ می‌شوند؛ پرداخت‌ها، وام‌ها، لاگ صندوق، درخواست‌های وام و رسیدها خالی می‌شوند و مبالغ اعضا و موجودی صندوق صفر می‌شود.

**پیش‌نیاز:**

- در `backend/.env` متغیر `DATABASE_URL` تنظیم شده باشد (رشته اتصال Neon).
- نصب وابستگی‌ها: `npm install` (پکیج `pg` استفاده می‌شود).

**اجرا** (از پوشه `backend`):

```bash
node scripts/clear-neon-except-members.js
```

**توجه:** این اسکریپت مستقیم به دیتابیس دپلو شده وصل می‌شود؛ قبل از اجرا از صحت `DATABASE_URL` و نیاز واقعی به پاک‌سازی مطمئن شوید.
