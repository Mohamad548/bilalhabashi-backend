require('dotenv').config();
const config = require('./config');

const PORT = process.env.PORT || 3001;

async function start() {
  if (config.usePg && config.loadDbFromPg) {
    const db = await config.loadDbFromPg();
    if (db) {
      config.setDb(db);
      console.log('دیتابیس از Neon (PostgreSQL) بارگذاری شد.');
    } else {
      console.error('DATABASE_URL تنظیم شده اما بارگذاری از Neon ناموفق بود.');
      process.exit(1);
    }
  }

  const app = require('./app');

  let telegramBot = null;
  try {
    telegramBot = require('./telegramBot');
  } catch (e) {}

  const { runLoanReminders } = require('./loanReminders');

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`API صندوق بلال حبشی روی پورت ${PORT} (دسترسی از شبکه: http://<آی‌پی-این-کامپیوتر>:${PORT})`);
    if (config.usePg) console.log('منبع داده: Neon (PostgreSQL)');
    else console.log('منبع داده: فایل db.json');
    if (telegramBot) {
      const run = () => runLoanReminders(telegramBot);
      setTimeout(run, 2 * 60 * 1000);
      setInterval(run, 60 * 60 * 1000);
      console.log('[LoanReminders] یادآوری سررسید وام هر ۱ ساعت اجرا می‌شود.');
    }
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
