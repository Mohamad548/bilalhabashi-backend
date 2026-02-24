require('dotenv').config();
const app = require('./app');

const PORT = process.env.PORT || 3001;

let telegramBot = null;
try {
  telegramBot = require('./telegramBot');
} catch (e) {}

const { runLoanReminders } = require('./loanReminders');

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API صندوق بلال حبشی روی پورت ${PORT} (دسترسی از شبکه: http://<آی‌پی-این-کامپیوتر>:${PORT})`);
  if (telegramBot) {
    const run = () => runLoanReminders(telegramBot);
    setTimeout(run, 2 * 60 * 1000);
    setInterval(run, 60 * 60 * 1000);
    console.log('[LoanReminders] یادآوری سررسید وام هر ۱ ساعت اجرا می‌شود.');
  }
});
