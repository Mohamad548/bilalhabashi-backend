/**
 * توابع کمکی تاریخ شمسی برای محاسبه سررسید وام و یادآوری
 */
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function toEnglishNum(s) {
  if (!s || typeof s !== 'string') return '';
  return s.replace(/[۰-۹]/g, (c) => String(PERSIAN_DIGITS.indexOf(c)));
}

function normalizeShamsi(str) {
  if (!str || typeof str !== 'string') return '';
  const s = toEnglishNum(str.trim()).replace(/\s/g, '');
  if (s.includes('/')) {
    const parts = s.split('/').map((p) => p.trim());
    if (parts.length === 3) {
      const [a, b, c] = parts.map(toEnglishNum);
      if (c && c.length >= 4) return `${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
      if (a && a.length >= 4) return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
    }
  }
  return s.replace(/-/g, '-');
}

function parseShamsi(str) {
  const n = normalizeShamsi(str);
  if (!n) return null;
  const parts = n.split('-').map(Number);
  if (parts.length !== 3) return null;
  const [y, m, d] = parts;
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return { y, m, d: Math.min(d, 31) };
}

/** اضافه کردن ماه به تاریخ شمسی، خروجی YYYY-MM-DD */
function addMonthsShamsi(dateStr, months) {
  const p = parseShamsi(dateStr);
  if (!p || months < 0) return '';
  let { y, m, d } = p;
  m += months;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  const lastDay = daysInMonthShamsi(y, m);
  d = Math.min(d, lastDay);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** تعداد روزهای ماه در تقویم شمسی (ماه ۱۲ بسته به کبیسه) */
function daysInMonthShamsi(y, m) {
  if (m <= 6) return 31;
  if (m <= 11) return 30;
  return (y % 4) === 3 ? 30 : 29;
}

/** تبدیل تاریخ میلادی به شمسی (تقریبی - برای مقایسه روز) */
function gregorianToShamsi(gregorianDate) {
  const g = new Date(gregorianDate);
  const gy = g.getFullYear();
  const gm = g.getMonth() + 1;
  const gd = g.getDate();
  const g_d_n = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334][gm - 1] + gd;
  const isLeap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  if (gm > 2 && isLeap) g_d_n += 1;
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  let j_d_n = 365 * gy + Math.floor((gy + 3) / 4) - 79;
  const j_np = Math.floor(j_d_n / 12053);
  j_d_n %= 12053;
  jy += 33 * j_np + Math.floor((j_d_n - 1) / 1461);
  j_d_n = (j_d_n - 1) % 1461;
  jy += Math.floor(j_d_n / 365);
  j_d_n %= 365;
  let jm, jd;
  if (j_d_n < 186) {
    jm = 1 + Math.floor(j_d_n / 31);
    jd = 1 + (j_d_n % 31);
  } else {
    jm = 7 + Math.floor((j_d_n - 186) / 30);
    jd = 1 + ((j_d_n - 186) % 30);
  }
  return `${jy}-${String(jm).padStart(2, '0')}-${String(jd).padStart(2, '0')}`;
}

function todayShamsi() {
  return gregorianToShamsi(new Date());
}

/** اختلاف روز بین دو تاریخ شمسی (date2 - date1). مثبت یعنی date2 بعد از date1 */
function diffDaysShamsi(date1Str, date2Str) {
  const p1 = parseShamsi(date1Str);
  const p2 = parseShamsi(date2Str);
  if (!p1 || !p2) return null;
  const toDays = (y, m, d) => {
    let days = d;
    for (let i = 1; i < m; i++) days += daysInMonthShamsi(y, i);
    days += (y - 1300) * 365 + Math.floor((y - 1300) / 4);
    return days;
  };
  return toDays(p2.y, p2.m, p2.d) - toDays(p1.y, p1.m, p1.d);
}

function formatNumTelegram(n) {
  if (n == null || isNaN(n)) return '۰';
  const s = String(Math.round(Number(n)));
  const grouped = s.replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
  return grouped.replace(/\d/g, (d) => PERSIAN_DIGITS[d]);
}

module.exports = {
  normalizeShamsi,
  addMonthsShamsi,
  todayShamsi,
  diffDaysShamsi,
  formatNumTelegram,
};
