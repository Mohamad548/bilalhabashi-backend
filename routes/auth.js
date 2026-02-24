const express = require('express');
const { db } = require('../config');

const router = express.Router();

router.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.users.find(
    (u) => u.username === username && u.password === password
  );
  if (!user) {
    return res.status(401).json({ success: false, message: 'نام کاربری یا رمز عبور اشتباه است.' });
  }
  const { password: _, ...safeUser } = user;
  res.json({
    success: true,
    user: safeUser,
    token: `token_${user.id}_${Date.now()}`,
  });
});

router.get('/auth/me', (req, res) => {
  const authHeader = (req.headers.authorization || '').trim();
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  if (!token || !token.startsWith('token_')) {
    return res.status(401).json({ message: 'توکن معتبر نیست.' });
  }
  const parts = token.split('_');
  const userId = parts[1];
  if (!userId) return res.status(401).json({ message: 'توکن معتبر نیست.' });
  const user = db.users.find((u) => String(u.id) === String(userId));
  if (!user) return res.status(401).json({ message: 'کاربر یافت نشد.' });
  const { password: __, ...safeUser } = user;
  res.json(safeUser);
});

module.exports = router;
