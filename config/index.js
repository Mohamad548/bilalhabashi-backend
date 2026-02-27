/**
 * تنظیمات سرور و منبع داده
 * اگر DATABASE_URL تنظیم شده باشد، دیتا از PostgreSQL (Neon) بارگذاری/ذخیره می‌شود؛ وگرنه از db.json
 */
const path = require('path');
const fs = require('fs');
const { loadFromPg, saveToPg, getPool, ensureDefaultAdmin } = require('../db/pg');

const rootDir = path.join(__dirname, '..');
const dbPath = path.join(rootDir, 'db.json');
const uploadsDir = path.join(rootDir, 'uploads');
const receiptsDir = path.join(uploadsDir, 'receipts');

let _db = null;
const usePg = !!process.env.DATABASE_URL;

if (!usePg) {
  try {
    _db = require(dbPath);
  } catch (e) {
    _db = {
      users: [],
      members: [],
      payments: [],
      loans: [],
      fundLog: [],
      fund: [{ id: 'main', cashBalance: 0 }],
      loanRequests: [],
      receiptSubmissions: [],
      telegramSettings: {},
    };
  }
}

function setDb(db) {
  _db = db;
}

function getDb() {
  return _db;
}

function persistDb() {
  if (usePg && _db) {
    return saveToPg(_db);
  }
  if (_db && !usePg) {
    fs.writeFileSync(dbPath, JSON.stringify(_db, null, 2), 'utf8');
  }
}

/** کاربر ادمین پیش‌فرض وقتی در دیتابیس هیچ کاربری نیست (فقط برای PostgreSQL) */
const DEFAULT_ADMIN = {
  id: '1',
  username: 'admin',
  password: 'admin123',
  name: 'مدیر صندوق',
  role: 'admin',
  avatar: null,
};

async function loadDbFromPg() {
  if (!usePg) return null;
  const db = await loadFromPg();
  if (!db) return null;
  if (!db.users || db.users.length === 0) {
    await ensureDefaultAdmin(DEFAULT_ADMIN);
    db.users = [DEFAULT_ADMIN];
    console.log('کاربر ادمین پیش‌فرض (admin / admin123) در دیتابیس ایجاد یا استفاده شد.');
  }
  _db = db;
  return db;
}

module.exports = {
  get db() {
    return _db;
  },
  setDb,
  getDb,
  persistDb,
  loadDbFromPg,
  usePg,
  rootDir,
  dbPath,
  uploadsDir,
  receiptsDir,
};
