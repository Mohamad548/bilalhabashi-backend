/**
 * تنظیمات سرور و مسیرها
 * تنها منبع داده در حافظه: db (فایل فقط برای بارگذاری و ذخیره)
 */
const path = require('path');
const fs = require('fs');

const rootDir = path.join(__dirname, '..');
const dbPath = path.join(rootDir, 'db.json');

const db = require(dbPath);

function persistDb() {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
}

const uploadsDir = path.join(rootDir, 'uploads');
const receiptsDir = path.join(uploadsDir, 'receipts');

module.exports = {
  db,
  persistDb,
  rootDir,
  dbPath,
  uploadsDir,
  receiptsDir,
};
