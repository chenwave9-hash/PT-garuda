import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import { Server } from 'socket.io';
import http from 'http';

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-pt-garuda';
const PORT = 3000;

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: { origin: '*' }
  });

  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // --- Database Setup ---
  const db = await open({
    filename: './database.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      uid TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      password TEXT,
      displayName TEXT,
      phoneNumber TEXT,
      balance INTEGER DEFAULT 0,
      role TEXT DEFAULT 'user',
      isBlocked INTEGER DEFAULT 0,
      photoURL TEXT,
      referralCode TEXT UNIQUE,
      referredBy TEXT,
      hasSeenReferralModal INTEGER DEFAULT 0,
      createdAt TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      uid TEXT,
      type TEXT,
      amount INTEGER,
      status TEXT,
      description TEXT,
      proofImage TEXT,
      createdAt TEXT,
      FOREIGN KEY(uid) REFERENCES users(uid)
    );

    CREATE TABLE IF NOT EXISTS investments (
      id TEXT PRIMARY KEY,
      uid TEXT,
      planId TEXT,
      planName TEXT,
      amount INTEGER,
      dailyProfit INTEGER,
      startDate TEXT,
      endDate TEXT,
      status TEXT,
      lastClaimDate TEXT,
      totalEarned INTEGER DEFAULT 0,
      FOREIGN KEY(uid) REFERENCES users(uid)
    );

    CREATE TABLE IF NOT EXISTS support_chats (
      id TEXT PRIMARY KEY,
      uid TEXT,
      message TEXT,
      sender TEXT,
      createdAt TEXT,
      FOREIGN KEY(uid) REFERENCES users(uid)
    );
  `);

  // --- Auth Middleware ---
  const authenticate = (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(' ')[1] || req.cookies.token;
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      next();
    } catch (err) {
      res.status(401).json({ message: 'Invalid token' });
    }
  };

  // --- API Routes ---

  // Auth
  app.post('/api/auth/signup', async (req, res) => {
    const { email, password, displayName, phoneNumber, referredBy } = req.body;
    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const uid = 'u_' + Math.random().toString(36).substr(2, 9);
      const referralCode = Math.random().toString(36).substr(2, 6).toUpperCase();
      
      await db.run(
        `INSERT INTO users (uid, email, password, displayName, phoneNumber, referralCode, referredBy, role, createdAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uid, email, hashedPassword, displayName, phoneNumber, referralCode, referredBy || '', email === 'chenwave9@gmail.com' ? 'admin' : 'user', new Date().toISOString()]
      );

      const token = jwt.sign({ uid, email, role: email === 'chenwave9@gmail.com' ? 'admin' : 'user' }, JWT_SECRET);
      res.json({ token, user: { uid, email, displayName, role: email === 'chenwave9@gmail.com' ? 'admin' : 'user' } });
    } catch (err: any) {
      res.status(400).json({ message: err.message || 'Signup failed' });
    }
  });

  app.post('/api/auth/signin', async (req, res) => {
    const { email, password } = req.body;
    const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const token = jwt.sign({ uid: user.uid, email: user.email, role: user.role }, JWT_SECRET);
    res.json({ token, user });
  });

  app.get('/api/auth/me', authenticate, async (req: any, res) => {
    const user = await db.get('SELECT * FROM users WHERE uid = ?', [req.user.uid]);
    res.json(user);
  });

  // Users (Admin)
  app.get('/api/users', authenticate, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    const users = await db.all('SELECT * FROM users ORDER BY createdAt DESC');
    res.json(users);
  });

  app.get('/api/users/referral/:code', async (req, res) => {
    const user = await db.get('SELECT uid FROM users WHERE referralCode = ?', [req.params.code.toUpperCase()]);
    res.json(user || null);
  });

  app.get('/api/users/referrals', authenticate, async (req: any, res) => {
    const referrals = await db.all('SELECT * FROM users WHERE referredBy = ? ORDER BY createdAt DESC', [req.user.uid]);
    res.json(referrals);
  });

  app.patch('/api/users/:uid', authenticate, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    const { balance, role, isBlocked } = req.body;
    await db.run('UPDATE users SET balance = ?, role = ?, isBlocked = ? WHERE uid = ?', [balance, role, isBlocked, req.params.uid]);
    res.json({ message: 'User updated' });
  });

  // Transactions
  app.get('/api/transactions', authenticate, async (req: any, res) => {
    const query = req.user.role === 'admin' ? 'SELECT * FROM transactions ORDER BY createdAt DESC' : 'SELECT * FROM transactions WHERE uid = ? ORDER BY createdAt DESC';
    const params = req.user.role === 'admin' ? [] : [req.user.uid];
    const txs = await db.all(query, params);
    res.json(txs);
  });

  app.post('/api/transactions', authenticate, async (req: any, res) => {
    const { type, amount, description, proofImage } = req.body;
    const id = 'tx_' + Math.random().toString(36).substr(2, 9);
    await db.run(
      'INSERT INTO transactions (id, uid, type, amount, status, description, proofImage, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.user.uid, type, amount, 'pending', description, proofImage || '', new Date().toISOString()]
    );
    res.json({ id });
  });

  app.patch('/api/transactions/:id', authenticate, async (req: any, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Forbidden' });
    const { status } = req.body;
    const tx = await db.get('SELECT * FROM transactions WHERE id = ?', [req.params.id]);
    if (!tx) return res.status(404).json({ message: 'Transaction not found' });

    if (status === 'approved' && tx.status === 'pending') {
      if (tx.type === 'deposit') {
        await db.run('UPDATE users SET balance = balance + ? WHERE uid = ?', [tx.amount, tx.uid]);
        // Check for referral reward (10% of first deposit)
        const user = await db.get('SELECT referredBy FROM users WHERE uid = ?', [tx.uid]);
        if (user?.referredBy) {
          const rewardAmount = Math.floor(tx.amount * 0.1);
          const rewardId = 'tx_' + Math.random().toString(36).substr(2, 9);
          await db.run(
            'INSERT INTO transactions (id, uid, type, amount, status, description, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [rewardId, user.referredBy, 'deposit', rewardAmount, 'approved', `Referral reward from ${tx.uid}`, new Date().toISOString()]
          );
          await db.run('UPDATE users SET balance = balance + ? WHERE uid = ?', [rewardAmount, user.referredBy]);
        }
      }
    }
    await db.run('UPDATE transactions SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'Transaction updated' });
  });

  // Investments
  app.get('/api/investments', authenticate, async (req: any, res) => {
    const invs = await db.all('SELECT * FROM investments WHERE uid = ? ORDER BY startDate DESC', [req.user.uid]);
    res.json(invs);
  });

  app.post('/api/investments', authenticate, async (req: any, res) => {
    const { planId, planName, amount, dailyProfit, durationDays } = req.body;
    const user = await db.get('SELECT balance FROM users WHERE uid = ?', [req.user.uid]);
    if (user.balance < amount) return res.status(400).json({ message: 'Insufficient balance' });

    const id = 'inv_' + Math.random().toString(36).substr(2, 9);
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + durationDays);

    await db.run('UPDATE users SET balance = balance - ? WHERE uid = ?', [amount, req.user.uid]);
    await db.run(
      'INSERT INTO investments (id, uid, planId, planName, amount, dailyProfit, startDate, endDate, status, lastClaimDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.user.uid, planId, planName, amount, dailyProfit, startDate.toISOString(), endDate.toISOString(), 'active', startDate.toISOString()]
    );
    res.json({ id });
  });

  app.post('/api/investments/claim', authenticate, async (req: any, res) => {
    const investments = await db.all('SELECT * FROM investments WHERE uid = ? AND status = "active"', [req.user.uid]);
    const now = new Date();
    let totalProfit = 0;
    let capitalReturn = 0;

    for (const inv of investments) {
      const lastClaim = new Date(inv.lastClaimDate);
      const diffMs = now.getTime() - lastClaim.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays > 0) {
        const endDate = new Date(inv.endDate);
        const remainingMs = endDate.getTime() - lastClaim.getTime();
        const remainingDays = Math.max(0, Math.floor(remainingMs / (1000 * 60 * 60 * 24)));
        const daysToClaim = Math.min(diffDays, remainingDays);

        if (daysToClaim > 0) {
          const profit = daysToClaim * inv.dailyProfit;
          totalProfit += profit;
          
          const newLastClaimDate = new Date(lastClaim);
          newLastClaimDate.setDate(newLastClaimDate.getDate() + daysToClaim);
          
          let newStatus = 'active';
          if (newLastClaimDate >= endDate) {
            newStatus = 'completed';
            capitalReturn += inv.amount;
          }

          await db.run(
            'UPDATE investments SET lastClaimDate = ?, status = ?, totalEarned = totalEarned + ? WHERE id = ?',
            [newLastClaimDate.toISOString(), newStatus, profit, inv.id]
          );
        }
      }
    }

    if (totalProfit > 0 || capitalReturn > 0) {
      await db.run('UPDATE users SET balance = balance + ? WHERE uid = ?', [totalProfit + capitalReturn, req.user.uid]);
      if (totalProfit > 0) {
        const txId = 'tx_' + Math.random().toString(36).substr(2, 9);
        await db.run(
          'INSERT INTO transactions (id, uid, type, amount, status, description, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [txId, req.user.uid, 'deposit', totalProfit, 'approved', 'Investment Profit', now.toISOString()]
        );
      }
      if (capitalReturn > 0) {
        const txId = 'tx_' + Math.random().toString(36).substr(2, 9);
        await db.run(
          'INSERT INTO transactions (id, uid, type, amount, status, description, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [txId, req.user.uid, 'deposit', capitalReturn, 'approved', 'Investment Capital Return', now.toISOString()]
        );
      }
    }

    res.json({ totalProfit, capitalReturn });
  });

  // Support Chats
  app.get('/api/support', authenticate, async (req: any, res) => {
    const query = req.user.role === 'admin' ? 'SELECT * FROM support_chats ORDER BY createdAt ASC' : 'SELECT * FROM support_chats WHERE uid = ? ORDER BY createdAt ASC';
    const params = req.user.role === 'admin' ? [] : [req.user.uid];
    const chats = await db.all(query, params);
    res.json(chats);
  });

  app.post('/api/support', authenticate, async (req: any, res) => {
    const { message, uid } = req.body; // uid provided by admin when replying
    const id = 'chat_' + Math.random().toString(36).substr(2, 9);
    const targetUid = req.user.role === 'admin' ? uid : req.user.uid;
    const sender = req.user.role === 'admin' ? 'admin' : 'user';
    
    await db.run(
      'INSERT INTO support_chats (id, uid, message, sender, createdAt) VALUES (?, ?, ?, ?, ?)',
      [id, targetUid, message, sender, new Date().toISOString()]
    );
    res.json({ id });
  });

  // --- Vite Setup ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
