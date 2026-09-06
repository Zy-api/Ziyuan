const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query, queryOne, run } = require('../lib/db');

const JWT_SECRET = process.env.JWT_SECRET || 'deployflow_secret_key_2026';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch { return null; }
}

function ts(date) {
  if (!date) return null;
  try { return new Date(date).getTime(); } catch { return null; }
}

function authMiddleware(handler) {
  return async (req, res) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : '';
    if (!token) return res.status(401).json({ success: false, error: '请先登录' });
    const payload = verifyToken(token);
    if (!payload) return res.status(401).json({ success: false, error: '登录已过期，请重新登录' });
    req.userId = payload.userId;
    req.user = payload;
    return handler(req, res);
  };
}

const crypto = require('crypto');

function randomHex(n) {
  return crypto.randomBytes(n).toString('hex').substring(0, n * 2);
}

module.exports = { JWT_SECRET, signToken, verifyToken, ts, authMiddleware, randomHex };
