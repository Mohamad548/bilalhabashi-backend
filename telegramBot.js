/**
 * ربات تلگرام صندوق بلال حبشی
 * با Long Polling کار می‌کند؛ از پروکسی پشتیبانی می‌کند (USE_PROXY + TELEGRAM_PROXY_URL).
 * دستورات: موجودی سپرده، مانده وام، پرداخت، لیست پرداختی‌ها، درخواست ثبت وام
 */

const TelegramBot = require('node-telegram-bot-api');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const http = require('http');
const { formatShamsiForDisplay } = require('./shamsiUtils');

const API_PORT = process.env.PORT || 3001;
const API_BASE = `http://127.0.0.1:${API_PORT}`;

function getTelegramProxyUrl() {
  const useProxy = String(process.env.USE_PROXY || '').trim() === 'true';
  const rawUrl = (process.env.TELEGRAM_PROXY_URL || '').trim();
  if (!useProxy || !rawUrl) return null;
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction && (rawUrl.includes('localhost') || rawUrl.includes('127.0.0.1'))) return null;
  return rawUrl;
}

function createProxyAgent(proxyUrl) {
  if (!proxyUrl) return null;
  const lower = proxyUrl.toLowerCase();
  if (lower.startsWith('socks5://') || lower.startsWith('socks4://')) {
    return new SocksProxyAgent(proxyUrl);
  }
  return new HttpsProxyAgent(proxyUrl);
}

function apiGet(path) {
  return new Promise((resolve, reject) => {
    http.get(API_BASE + path, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function apiPost(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const postData = JSON.stringify(body);
    const opt = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    };
    const req = http.request(opt, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          resolve({});
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function apiPatch(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const postData = JSON.stringify(body);
    const opt = {
      hostname: url.hostname,
      port: url.port || 80,
      path: url.pathname,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) },
    };
    const req = http.request(opt, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(data ? JSON.parse(data) : {});
        } catch (e) {
          resolve({});
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function formatNum(n) {
  if (n == null || isNaN(n)) return '۰';
  const s = String(Math.round(Number(n)));
  const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return grouped.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
}

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.log('[Telegram] TELEGRAM_BOT_TOKEN در .env تنظیم نشده؛ ربات تلگرام غیرفعال است.');
  return null;
}

const proxyUrl = getTelegramProxyUrl();
console.log('[Telegram] USE_PROXY=', process.env.USE_PROXY);
console.log('[Telegram] TELEGRAM_PROXY_URL=', process.env.TELEGRAM_PROXY_URL ? '(تنظیم شده)' : '(خالی)');
if (proxyUrl) {
  try {
    const u = new URL(proxyUrl);
    console.log('[Telegram] پروکسی فعال: پروتکل=', u.protocol, '، هاست=', u.hostname, '، پورت=', u.port || '(پیش‌فرض)');
  } catch (e) {
    console.log('[Telegram] پروکسی فعال، آدرس=', proxyUrl.replace(/:[^:@]+@/, ':****@'));
  }
} else {
  console.log('[Telegram] پروکسی غیرفعال؛ اتصال مستقیم به api.telegram.org');
}

const requestOptions = proxyUrl ? { agent: createProxyAgent(proxyUrl) } : {};
const webhookUrl = (process.env.TELEGRAM_WEBHOOK_URL || '').trim();
const useWebhook = webhookUrl.length > 0;

let bot;
try {
  bot = new TelegramBot(token, { polling: !useWebhook, request: requestOptions });
  if (proxyUrl) console.log('[Telegram] ربات با پروکسی راه‌اندازی شد.');
} catch (err) {
  console.error('[Telegram] خطا در ساخت ربات:', err.message);
  return null;
}

if (useWebhook) {
  console.log('[Telegram] حالت Webhook فعال است؛ TELEGRAM_WEBHOOK_URL تنظیم شده. بعد از بالا آمدن سرور، Webhook ثبت می‌شود.');
  bot.setWebhookIfConfigured = function () {
    bot.setWebHook(webhookUrl).then(() => {
      console.log('[Telegram] Webhook با موفقیت ثبت شد:', webhookUrl);
    }).catch((err) => {
      console.error('[Telegram] خطا در ثبت Webhook:', err.message);
    });
  };
} else {
  bot.on('polling_error', (err) => {
    console.error('[Telegram] خطای Polling:', err.message);
    if (err.message && err.message.includes('ECONNREFUSED')) {
      console.error('[Telegram] راهنما: ECONNREFUSED یعنی روی آدرس/پورت پروکسی چیزی گوش نمی‌دهد.');
    }
  });
}

const startKeyboard = {
  inline_keyboard: [
    [{ text: '💰 موجودی سپرده', callback_data: 'dep_balance' }],
    [{ text: '📋 مانده وام', callback_data: 'loan_balance' }],
    [{ text: '💵 پرداخت', callback_data: 'payment' }],
    [{ text: '📜 لیست پرداختی‌ها', callback_data: 'payment_list' }],
    [{ text: '📝 درخواست ثبت وام', callback_data: 'loan_request' }],
  ],
};

// منوی ثابت زیر صفحهٔ چت (جایگزین صفحه‌کلید)
const replyMenu = {
  keyboard: [
    ['💵 پرداخت'],
    ['💰 موجودی سپرده', '📜 لیست پرداختی‌ها'],
    ['📝 درخواست ثبت وام', '📋 مانده وام'],
    ['🆘 پشتیبانی'],
  ],
  resize_keyboard: true,
  one_time_keyboard: false,
};

const MENU_TO_ACTION = {
  '💵 پرداخت': 'payment',
  '💰 موجودی سپرده': 'dep_balance',
  '📜 لیست پرداختی‌ها': 'payment_list',
  '📝 درخواست ثبت وام': 'loan_request',
  '📋 مانده وام': 'loan_balance',
  '🆘 پشتیبانی': 'support',
};

// کاربرانی که در انتظار وارد کردن کد ملی برای اتصال حساب هستند: { [chatId]: { action: string } }
const pendingLink = {};
// کاربرانی که در انتظار ارسال رسید (پرداخت شخصی) هستند: { [chatId]: { memberId: string } }
const pendingReceipt = {};
// چت مدیر در انتظار علت رد درخواست وام: { [chatId]: { loanRequestId: string } }
const pendingRejectReason = {};

function normalizeNationalId(text) {
  if (!text || typeof text !== 'string') return '';
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  let s = text.trim().replace(/\s/g, '');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    const idx = persianDigits.indexOf(c);
    if (idx !== -1) out += String(idx);
    else if (/\d/.test(c)) out += c;
  }
  return out;
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const name = msg.from?.first_name || 'کاربر';
  const text = (msg.text || '').trim().toLowerCase();

  // اتصال چت مدیر از پنل: کاربر از لینک «برقراری با تلگرام» (start=admin) آمده
  if (text === '/start admin' || text.startsWith('/start admin')) {
    try {
      const res = await apiPost('/api/telegram/link-admin', { chatId: String(chatId) });
      if (res && res.success) {
        await bot.sendMessage(chatId, '✅ اتصال برقرار شد.\nاز این پس اعلان‌های درخواست وام و پرداخت به این چت ارسال می‌شوند.\n\nبه پنل تنظیمات برگردید و در صورت نیاز صفحه را یک بار رفرش کنید.');
        console.log('[Telegram/چت-مدیر] چت مدیر از طریق /start admin ثبت شد؛ chatId=', chatId);
      } else {
        await bot.sendMessage(chatId, '❌ ثبت اتصال ناموفق بود. لطفاً دوباره از پنل دکمه «برقراری با تلگرام» را بزنید.');
      }
    } catch (e) {
      console.error('[Telegram/چت-مدیر] خطا در link-admin از ربات:', e.message);
      await bot.sendMessage(chatId, '❌ خطا در ارتباط با سرور. لطفاً بعداً تلاش کنید.');
    }
    return;
  }

  try {
    const members = await apiGet('/api/members?telegramChatId=' + String(chatId));
    const list = Array.isArray(members) ? members : members && members[0] ? [members] : [];
    const member = list.find((m) => String(m.telegramChatId) === String(chatId));

    if (member) {
      const welcomeText = `سلام ${name}.

به ربات صندوق قرض‌الحسنه بلال حبشی خوش آمدید.

با این ربات می‌توانید:
• موجودی سپرده و مانده وام خود را ببینید
• لیست پرداخت‌ها را مشاهده کنید
• درخواست وام ثبت کنید

از دکمه‌های منو (پایین صفحه) گزینه مورد نظر را انتخاب کنید.

──────────────────
طراحی و توسعه محمد محمودی
https://t.me/mahmodi298`;
      await bot.sendMessage(chatId, welcomeText, {
        reply_markup: replyMenu,
      });
    } else {
      pendingLink[chatId] = { action: 'start' };
      const guestText = `سلام ${name}.

به ربات صندوق قرض‌الحسنه بلال حبشی خوش آمدید. با این ربات اعضا می‌توانند موجودی سپرده، مانده وام و درخواست وام را مدیریت کنند.

لطفاً جهت اتصال حساب، کد ملی (۱۰ رقم) خود را وارد کنید.

──────────────────
طراحی و توسعه محمد محمودی
https://t.me/mahmodi298`;
      await bot.sendMessage(chatId, guestText, {
        reply_markup: { remove_keyboard: true },
      });
    }
  } catch (e) {
    await bot.sendMessage(chatId, 'خطا در ارتباط با سرور. لطفاً بعداً تلاش کنید.', { reply_markup: replyMenu });
  }
  console.log('[Telegram] /start از chatId=', chatId, '| برای اعلان در .env: TELEGRAM_NOTIFY_CHAT_ID=' + chatId);
});

// پیام عکس: رسید پرداخت شخصی
bot.on('photo', async (msg) => {
  const chatId = msg.chat.id;
  const pending = pendingReceipt[chatId];
  if (!pending) return;
  const photo = msg.photo;
  if (!photo || photo.length === 0) return;
  const fileId = photo[photo.length - 1].file_id;
  try {
    const res = await apiPost('/api/receipt-submissions', {
      memberId: pending.memberId,
      fileId,
    });
    if (res && res.id != null) {
      await bot.sendMessage(
        chatId,
        'واریزی شما در حال بررسی توسط مدیر صندوق است. در صورت تایید اعلام خواهد شد.',
        { reply_markup: replyMenu }
      );
    } else {
      await bot.sendMessage(chatId, 'خطا در ثبت رسید. لطفاً دوباره تلاش کنید.', { reply_markup: replyMenu });
    }
  } catch (e) {
    await bot.sendMessage(chatId, 'خطا در ارتباط با سرور. لطفاً بعداً تلاش کنید.', { reply_markup: replyMenu });
  }
  delete pendingReceipt[chatId];
});

// پیام متنی: دکمه منو یا کد ملی (یا علت رد درخواست وام از مدیر)
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text && msg.text.trim();
  if (!text || msg.text.startsWith('/')) return;

  const pendingReject = pendingRejectReason[chatId];
  if (pendingReject && pendingReject.loanRequestId) {
    const reason = text;
    const id = pendingReject.loanRequestId;
    delete pendingRejectReason[chatId];
    try {
      await apiPatch('/api/loanRequests/' + encodeURIComponent(id), { status: 'rejected', rejectReason: reason });
      await apiPost('/api/loanRequests/' + encodeURIComponent(id) + '/notifyRejection', { reason });
      await bot.sendMessage(chatId, '✅ درخواست رد شد و پیام (به‌همراه علت رد) به کاربر ارسال شد.');
    } catch (e) {
      await bot.sendMessage(chatId, '❌ خطا در ثبت رد درخواست. لطفاً دوباره تلاش کنید.');
    }
    return;
  }

  const pending = pendingLink[chatId];
  if (!pending) {
    const action = MENU_TO_ACTION[text];
    if (action) {
      const userName = msg.from?.username || msg.from?.first_name || 'ناشناس';
      await runMenuAction(chatId, action, userName);
    }
    return;
  }

  const nationalId = normalizeNationalId(text);
  if (nationalId.length !== 10) {
    await bot.sendMessage(chatId, 'کد ملی باید ۱۰ رقم باشد. لطفاً دوباره وارد کنید.');
    return;
  }

  try {
    const members = await apiGet('/api/members?nationalId=' + encodeURIComponent(nationalId));
    const list = Array.isArray(members) ? members : members && members[0] ? [members] : [];
    if (list.length !== 1) {
      await bot.sendMessage(chatId, 'کد ملی در لیست اعضا یافت نشد. لطفاً کد صحیح را وارد کنید یا با مدیر صندوق تماس بگیرید.', {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: 'ارتباط با پشتیبانی',
                url: 'https://t.me/arzansarayfaraji'
              }
            ]
          ]
        }
      });
      return;
    }

    const member = list[0];
    await apiPatch('/api/members/' + encodeURIComponent(member.id), { telegramChatId: String(chatId) });
    delete pendingLink[chatId];

    await bot.sendMessage(chatId, 'حساب شما با موفقیت متصل شد.');

    const action = pending.action;
    if (action === 'start') {
      await bot.sendMessage(chatId, 'حساب شما متصل شد. از دکمه‌های منو (پایین صفحه) گزینه مورد نظر را انتخاب کنید.', { reply_markup: replyMenu });
      return;
    }

    if (action === 'dep_balance') {
      const deposit = member.deposit ?? 0;
      await bot.sendMessage(chatId, `موجودی سپرده شما: ${formatNum(deposit)} تومان`, { reply_markup: replyMenu });
      return;
    }
    if (action === 'loan_balance') {
      const balance = member.loanBalance ?? 0;
      await bot.sendMessage(chatId, `مانده وام شما: ${formatNum(balance)} تومان`, { reply_markup: replyMenu });
      return;
    }
    if (action === 'payment_list') {
      let payments = [];
      try {
        payments = await apiGet('/api/payments?memberId=' + encodeURIComponent(member.id));
      } catch (e) {}
      const listPay = Array.isArray(payments) ? payments : [];
      if (listPay.length === 0) {
        await bot.sendMessage(chatId, 'پرداختی ثبت‌شده‌ای برای شما وجود ندارد.', { reply_markup: replyMenu });
        return;
      }
      const lines = listPay.slice(0, 15).map((p) => {
        const type = p.type === 'contribution' ? 'واریز' : 'بازپرداخت';
        const dateDisplay = p.date ? formatShamsiForDisplay(String(p.date)) : '-';
        return `${dateDisplay}: ${type} ${formatNum(p.amount)} تومان`;
      });
      await bot.sendMessage(chatId, 'آخرین پرداختی‌ها:\n\n' + lines.join('\n') + (listPay.length > 15 ? '\n\n...' : ''), { reply_markup: replyMenu });
      return;
    }

    await bot.sendMessage(chatId, 'از دکمه‌های منو گزینه مورد نظر را انتخاب کنید.', { reply_markup: replyMenu });
  } catch (e) {
    await bot.sendMessage(chatId, 'خطا در ارتباط با سرور. لطفاً دوباره تلاش کنید.', { reply_markup: replyMenu });
  }
});

// اجرای یک اکشن منو (موجودی، مانده وام، لیست پرداخت، پرداخت، درخواست وام)
async function runMenuAction(chatId, action, userName) {
  const withMenu = (opts) => ({ ...opts, reply_markup: replyMenu });

  if (action === 'payment') {
    const paymentTypeKeyboard = {
      inline_keyboard: [
        [{ text: '👨‍👩‍👧‍👦 پرداخت خانوادگی', callback_data: 'payment_family' }],
        [{ text: '👤 پرداخت شخصی', callback_data: 'payment_personal' }],
      ],
    };
    await bot.sendMessage(chatId, 'نوع پرداخت را انتخاب کنید:', {
      reply_markup: { ...paymentTypeKeyboard },
    });
    return;
  }
  if (action === 'support') {
    await bot.sendMessage(
      chatId,
      'برای پشتیبانی و سؤال با طراح ربات تماس بگیرید:\n\nمحمد محمودی\nhttps://t.me/mahmodi298',
      withMenu({})
    );
    return;
  }
  if (action === 'loan_request') {
    let member = null;
    try {
      const members = await apiGet('/api/members?telegramChatId=' + String(chatId));
      member = Array.isArray(members)
        ? members.find((m) => String(m.telegramChatId) === String(chatId))
        : (members && members[0]) || null;
    } catch (e) {}

    // اگر عضو وام فعال دارد، اجازه ثبت درخواست جدید نده
    if (member && (member.loanBalance ?? 0) > 0) {
      await bot.sendMessage(
        chatId,
        'شما در حال حاضر وام فعال دارید. پس از تسویه وام قبلی می‌توانید درخواست وام جدید ثبت کنید.',
        withMenu({})
      );
      return;
    }

    // بررسی وجود درخواست‌های قبلی این کاربر از طریق ربات
    try {
      const existing = await apiGet('/api/loanRequests?telegramChatId=' + String(chatId));
      const list = Array.isArray(existing)
        ? existing
        : existing && existing[0]
          ? [existing]
          : [];

      const hasPending = list.some((r) => r.status === 'pending');
      const hasApproved = list.some((r) => r.status === 'approved');

      if (hasPending) {
        await bot.sendMessage(
          chatId,
          'شما در حال حاضر یک درخواست وام «در انتظار بررسی» دارید. لطفاً منتظر تأیید ادمین بمانید.',
          withMenu({})
        );
        return;
      }

      if (hasApproved) {
        await bot.sendMessage(
          chatId,
          'درخواست قبلی شما تأیید شده و در لیست اعطاکنندگان قرار گرفته است. تا زمانی که آن وام اعطا/تسویه نشود، امکان ثبت درخواست جدید نیست.',
          withMenu({})
        );
        return;
      }
    } catch (e) {
      // اگر خواندن درخواست‌های قبلی خطا داد، ادامه می‌دهیم و فقط سعی می‌کنیم درخواست جدید ثبت کنیم
    }

    // در این مرحله، یا هیچ درخواستی وجود ندارد یا همه رد شده‌اند؛ اجازه ثبت درخواست جدید بده
    try {
      const memberUserName = String(userName || 'ناشناس');
      const createRes = await apiPost('/api/loanRequests', {
        telegramChatId: String(chatId),
        userName: memberUserName,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
      await bot.sendMessage(
        chatId,
        'درخواست ثبت وام شما ثبت شد. در پنل ادمین، منوی «درخواست‌ها» قابل مشاهده است.',
        withMenu({})
      );
      const loanRequestId = createRes && createRes.id != null ? String(createRes.id) : '';
      apiPost('/api/telegram/notify-admin-new-loan-request', {
        telegramChatId: String(chatId),
        userName: memberUserName,
        loanRequestId,
      }).catch((e) => console.error('[Telegram] خطا در فراخوانی اعلان به مدیر:', e.message));
    } catch (e) {
      await bot.sendMessage(chatId, 'خطا در ثبت درخواست. دوباره تلاش کنید.', withMenu({}));
    }
    return;
  }
  if (action === 'dep_balance' || action === 'loan_balance' || action === 'payment_list') {
    let members = [];
    try {
      members = await apiGet('/api/members?telegramChatId=' + String(chatId));
    } catch (e) {
      await bot.sendMessage(chatId, 'خطا در ارتباط با سرور.', withMenu({}));
      return;
    }
    const member = Array.isArray(members) ? members.find((m) => String(m.telegramChatId) === String(chatId)) : (members && members[0]) || null;
    if (!member) {
      pendingLink[chatId] = { action };
      await bot.sendMessage(chatId, 'برای استفاده، ابتدا حساب خود را متصل کنید. کد ملی (۱۰ رقم) خود را وارد کنید.', {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }
    if (action === 'dep_balance') {
      const deposit = member.deposit ?? 0;
      await bot.sendMessage(chatId, `موجودی سپرده شما: ${formatNum(deposit)} تومان`, withMenu({}));
      return;
    }
    if (action === 'loan_balance') {
      const balance = member.loanBalance ?? 0;
      await bot.sendMessage(chatId, `مانده وام شما: ${formatNum(balance)} تومان`, withMenu({}));
      return;
    }
    if (action === 'payment_list') {
      let payments = [];
      try {
        payments = await apiGet('/api/payments?memberId=' + encodeURIComponent(member.id));
      } catch (e) {}
      const list = Array.isArray(payments) ? payments : [];
      if (list.length === 0) {
        await bot.sendMessage(chatId, 'پرداختی ثبت‌شده‌ای برای شما وجود ندارد.', withMenu({}));
        return;
      }
      const lines = list.slice(0, 15).map((p) => {
        const type = p.type === 'contribution' ? 'واریز' : 'بازپرداخت';
        const dateDisplay = p.date ? formatShamsiForDisplay(String(p.date)) : '-';
        return `${dateDisplay}: ${type} ${formatNum(p.amount)} تومان`;
      });
      await bot.sendMessage(chatId, 'آخرین پرداختی‌ها:\n\n' + lines.join('\n') + (list.length > 15 ? '\n\n...' : ''), withMenu({}));
    }
  }
}

bot.on('callback_query', async (query) => {
  const chatId = query.message?.chat?.id;
  const data = query.data;
  const userName = query.from?.username || query.from?.first_name || 'ناشناس';

  try {
    await bot.answerCallbackQuery(query.id);
  } catch (e) {}

  if (!chatId) return;

  if (data && data.startsWith('loan_approve_')) {
    const id = data.replace(/^loan_approve_/, '');
    if (!id) return;
    await bot.sendMessage(chatId, 'آیا تأیید این درخواست وام را می‌کنید؟', {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'بله، تأیید', callback_data: 'loan_do_approve_' + id }],
          [{ text: 'انصراف', callback_data: 'loan_cancel' }],
        ],
      },
    });
    return;
  }
  if (data && data.startsWith('loan_reject_')) {
    const id = data.replace(/^loan_reject_/, '');
    if (!id) return;
    pendingRejectReason[chatId] = { loanRequestId: id };
    await bot.sendMessage(chatId, 'علت رد درخواست را در یک پیام بنویسید تا به کاربر ارسال شود.');
    return;
  }
  if (data && data.startsWith('loan_do_approve_')) {
    const id = data.replace(/^loan_do_approve_/, '');
    if (!id) return;
    try {
      await apiPatch('/api/loanRequests/' + encodeURIComponent(id), { status: 'approved' });
      await apiPost('/api/loanRequests/' + encodeURIComponent(id) + '/notifyApproval');
      await bot.sendMessage(chatId, '✅ درخواست وام تأیید شد و به کاربر اعلام شد.');
    } catch (e) {
      await bot.sendMessage(chatId, '❌ خطا در تأیید درخواست. لطفاً دوباره تلاش کنید.');
    }
    return;
  }
  if (data === 'loan_cancel') {
    return;
  }

  if (data === 'payment_family') {
    await bot.sendMessage(chatId, 'پرداخت خانوادگی در ادامه تکمیل می‌شود.', { reply_markup: replyMenu });
    return;
  }
  if (data === 'payment_personal') {
    let member = null;
    try {
      const members = await apiGet('/api/members?telegramChatId=' + String(chatId));
      const list = Array.isArray(members) ? members : members && members[0] ? [members] : [];
      member = list.find((m) => String(m.telegramChatId) === String(chatId));
    } catch (e) {}
    if (!member) {
      await bot.sendMessage(chatId, 'حساب شما یافت نشد. ابتدا با کد ملی حساب خود را متصل کنید.', { reply_markup: replyMenu });
      return;
    }
    pendingReceipt[chatId] = { memberId: member.id };
    await bot.sendMessage(chatId, 'لطفا رسید خود را ارسال کنید.', { reply_markup: replyMenu });
    return;
  }

  const menuActions = ['dep_balance', 'loan_balance', 'payment_list', 'payment', 'loan_request', 'support'];
  if (menuActions.includes(data)) {
    await runMenuAction(chatId, data, userName);
  }
});

if (useWebhook) {
  console.log('[Telegram] ربات تلگرام فعال شد (Webhook).');
} else {
  console.log('[Telegram] ربات تلگرام فعال شد (Long Polling).');
}

module.exports = bot;
