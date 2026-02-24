require('dotenv').config();
const express = require('express');
const jsonServer = require('json-server');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const { db, uploadsDir, receiptsDir } = require('./config');
const persistAfterRouter = require('./middleware/persistAfterRouter');
const loansGuard = require('./middleware/loansGuard');
const authRoutes = require('./routes/auth');
const telegramRoutes = require('./routes/telegram');
const receiptSubmissionsRoutes = require('./routes/receiptSubmissions');
const resetDbRoutes = require('./routes/resetDb');

const app = express();

app.use(cors());
app.use(express.json());

try {
  fs.mkdirSync(receiptsDir, { recursive: true });
} catch (e) {}
app.use('/uploads', express.static(uploadsDir));

app.use('/api', authRoutes);
app.use('/api', telegramRoutes);
app.use('/api', receiptSubmissionsRoutes);
app.use('/api', resetDbRoutes);

app.post('/api/loans', loansGuard, (req, res, next) => next());

const jsonRouter = jsonServer.router(db);
const jsonMiddlewares = jsonServer.defaults({ static: path.join(__dirname, 'public') });
app.use('/api', jsonMiddlewares, persistAfterRouter, jsonRouter);

module.exports = app;
