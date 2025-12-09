// server.js
// Express + Socket.io + SQLite + JWT auth + multer (uploads)
// Run: npm install && node server.js

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const SECRET = process.env.JWT_SECRET || 'cambiame_pon_un_secreto_muy_largo';
const TOKEN_NAME = 'comunidad_token';
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// DB inicialización (SQLite)
const DB_FILE = path.join(__dirname, 'data', 'foro.db');
if (!fs.existsSync(path.dirname(DB_FILE))) fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
const db = new sqlite3.Database(DB_FILE);

// Crear tablas si no existen
db.serialize(() => {
  db.run(`PRAGMA foreign_keys = ON;`);
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user',
    banned INTEGER DEFAULT 0,
    createdAt TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS topics (
    id TEXT PRIMARY KEY,
    title TEXT,
    content TEXT,
    authorId TEXT,
    image TEXT,
    createdAt TEXT,
    FOREIGN KEY(authorId) REFERENCES users(id) ON DELETE SET NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS replies (
    id TEXT PRIMARY KEY,
    topicId TEXT,
    content TEXT,
    authorId TEXT,
    image TEXT,
    createdAt TEXT,
    FOREIGN KEY(topicId) REFERENCES topics(id) ON DELETE CASCADE,
    FOREIGN KEY(authorId) REFERENCES users(id) ON DELETE SET NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS likes (
    id TEXT PRIMARY KEY,
    userId TEXT,
    targetType TEXT, -- 'topic' or 'reply'
    targetId TEXT,
    createdAt TEXT,
    UNIQUE(userId,targetType,targetId)
  )`);
});

// Helper: create JWT token
function createToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '7d' });
}
function verifyToken(token) {
  try {
    return jwt.verify(token, SECRET);
  } catch (e) { return null; }
}

// Multer config for images
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${uuidv4()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.png','.jpg','.jpeg','.gif','.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  }
});

// ---------- Auth endpoints ----------
app.post('/api/auth/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Falta username o password' });
  const hashed = await bcrypt.hash(password, 10);
  const id = uuidv4();
  const now = new Date().toISOString();
  db.run(`INSERT INTO users (id,username,password,role,createdAt) VALUES (?, ?, ?, 'user', ?)`,
    [id, username, hashed, now],
    function(err) {
      if (err) return res.status(400).json({ error: 'Usuario ya existe' });
      const token = createToken({ id, username, role: 'user' });
      res.cookie?.(TOKEN_NAME, token, { httpOnly: true }); // optional
      res.json({ token, id, username, role: 'user' });
    });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Falta username o password' });
  db.get(`SELECT id, username, password, role, banned FROM users WHERE username = ?`, [username], async (err, row) => {
    if (err || !row) return res.status(401).json({ error: 'Credenciales inválidas' });
    if (row.banned) return res.status(403).json({ error: 'Usuario baneado' });
    const match = await bcrypt.compare(password, row.password);
    if (!match) return res.status(401).json({ error: 'Credenciales inválidas' });
    const token = createToken({ id: row.id, username: row.username, role: row.role });
    res.json({ token, id: row.id, username: row.username, role: row.role });
  });
});

// Middleware: protect route, put user info in req.user if token present in Authorization header (Bearer)
function authMiddleware(req,res,next){
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : (req.body && req.body.token) || null;
  if (!token) { req.user = null; return next(); }
  const payload = verifyToken(token);
  if (!payload) { req.user = null; return next(); }
  req.user = payload;
  next();
}
app.use(authMiddleware);

// ---------- Foro API (topics, replies, images, likes) ----------

// List topics (with replies)
app.get('/api/foro', (req,res) => {
  const sql = `SELECT t.*, u.username as author FROM topics t LEFT JOIN users u ON t.authorId = u.id ORDER BY createdAt DESC`;
  db.all(sql, [], (err, rows) => {
    if (err) return res.status(500).json([]);
    // fetch replies per topic, and like counts
    const ids = rows.map(r => r.id);
    if (ids.length === 0) return res.json([]);
    const placeholders = ids.map(()=>'?').join(',');
    db.all(`SELECT r.*, u.username as author FROM replies r LEFT JOIN users u ON r.authorId = u.id WHERE topicId IN (${placeholders}) ORDER BY createdAt ASC`, ids, (err2, replies) => {
      if (err2) replies = [];
      // likes counts
      db.all(`SELECT targetType,targetId,COUNT(*) as cnt FROM likes WHERE targetId IN (${placeholders}) GROUP BY targetType,targetId`, ids, (err3, likesRows) => {
        const likesMap = {};
        if (!err3) {
          likesRows.forEach(l => { likesMap[`${l.targetType}_${l.targetId}`] = l.cnt; });
        }
        const out = rows.map(r => {
          const rReplies = (replies || []).filter(x => x.topicId === r.id);
          const likeCount = likesMap[`topic_${r.id}`] || 0;
          return { ...r, replies: rReplies, likes: likeCount };
        });
        res.json(out);
      });
    });
  });
});

// Create topic (with optional image)
app.post('/api/foro', upload.single('image'), (req,res) => {
  if (!req.user) return res.status(401).json({ error: 'Autenticación requerida' });
  const { title, content } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Falta título o contenido' });
  const id = uuidv4();
  const image = req.file ? `/uploads/${req.file.filename}` : null;
  const now = new Date().toISOString();
  db.run(`INSERT INTO topics (id,title,content,authorId,image,createdAt) VALUES (?,?,?,?,?,?)`,
    [id, title, content, req.user.id, image, now],
    function(err) {
      if (err) return res.status(500).json({ error: 'No se pudo guardar topic' });
      res.status(201).json({ id, title, content, author: req.user.username, image, createdAt: now });
    });
});

// Create reply (with optional image)
app.post('/api/foro/:id/reply', upload.single('image'), (req,res) => {
  if (!req.user) return res.status(401).json({ error: 'Autenticación requerida' });
  const topicId = req.params.id;
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: 'Falta contenido' });
  const id = uuidv4();
  const image = req.file ? `/uploads/${req.file.filename}` : null;
  const now = new Date().toISOString();
  db.run(`INSERT INTO replies (id,topicId,content,authorId,image,createdAt) VALUES (?,?,?,?,?,?)`,
    [id, topicId, content, req.user.id, image, now],
    function(err) {
      if (err) return res.status(500).json({ error: 'No se pudo guardar reply' });
      res.status(201).json({ id, topicId, content, author: req.user.username, image, createdAt: now });
    });
});

// Likes toggle endpoint (topic or reply)
app.post('/api/like', (req,res) => {
  if (!req.user) return res.status(401).json({ error: 'Autenticación requerida' });
  const { targetType, targetId } = req.body;
  if (!targetType || !targetId) return res.status(400).json({ error: 'Falta targetType/targetId' });
  const userId = req.user.id;
  // try delete existing like (toggle)
  db.get(`SELECT id FROM likes WHERE userId=? AND targetType=? AND targetId=?`, [userId,targetType,targetId], (err,row) => {
    if (row) {
      db.run(`DELETE FROM likes WHERE id=?`, [row.id], function(err2){
        if (err2) return res.status(500).json({ error:'Error removiendo like' });
        return res.json({ action:'removed' });
      });
    } else {
      const id = uuidv4();
      const now = new Date().toISOString();
      db.run(`INSERT INTO likes (id,userId,targetType,targetId,createdAt) VALUES (?,?,?,?,?)`, [id,userId,targetType,targetId,now], function(err3){
        if (err3) return res.status(500).json({ error:'Error guardando like' });
        return res.json({ action:'added' });
      });
    }
  });
});

// Moderation endpoints (require role 'admin' or 'moderator')
function requireModerator(req,res,next){
  if (!req.user) return res.status(401).json({ error: 'Autenticación requerida' });
  if (req.user.role === 'admin' || req.user.role === 'moderator') return next();
  return res.status(403).json({ error: 'Privilegios insuficientes' });
}

// Delete topic
app.delete('/api/mod/topic/:id', requireModerator, (req,res) => {
  const id = req.params.id;
  db.run(`DELETE FROM topics WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error:'Error borrando topic' });
    res.json({ ok:true });
  });
});

// Delete reply
app.delete('/api/mod/reply/:id', requireModerator, (req,res) => {
  const id = req.params.id;
  db.run(`DELETE FROM replies WHERE id=?`, [id], function(err){
    if (err) return res.status(500).json({ error:'Error borrando reply' });
    res.json({ ok:true });
  });
});

// Ban/unban user
app.post('/api/mod/ban/:userId', requireModerator, (req,res) => {
  const userId = req.params.userId;
  const { action } = req.body; // 'ban' or 'unban'
  const ban = action === 'ban' ? 1 : 0;
  db.run(`UPDATE users SET banned=? WHERE id=?`, [ban,userId], function(err){
    if (err) return res.status(500).json({ error:'Error cambiando estado' });
    res.json({ ok:true });
  });
});

// Promote a user to moderator/admin (only admin allowed)
app.post('/api/mod/promote/:userId', (req,res) => {
  if (!req.user) return res.status(401).json({ error: 'Autenticación requerida' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Solo admin puede promover' });
  const { role } = req.body; // 'moderator' or 'admin'
  db.run(`UPDATE users SET role=? WHERE id=?`, [role, req.params.userId], function(err){
    if (err) return res.status(500).json({ error:'Error promoviendo' });
    res.json({ ok:true });
  });
});

// Expose simple user info endpoint
app.get('/api/me', (req,res) => {
  if (!req.user) return res.json({ user: null });
  db.get(`SELECT id,username,role,banned FROM users WHERE id=?`, [req.user.id], (err,row) => {
    if (err || !row) return res.json({ user: null });
    res.json({ user: row });
  });
});

// ---------- Chat via socket.io ----------
io.use((socket, next) => {
  // optional auth from client via token in query
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      socket.user = payload;
    }
  }
  next();
});

io.on('connection', (socket) => {
  console.log('Socket connected', socket.id, socket.user ? socket.user.username : '(anon)');
  socket.on('chat:message', (msg) => {
    const message = {
      id: uuidv4(),
      author: socket.user ? socket.user.username : (msg.author || 'Anónimo'),
      text: String(msg.text).slice(0,2000),
      ts: new Date().toISOString()
    };
    io.emit('chat:message', message);
  });
  socket.on('disconnect', ()=>{});
});

// Start server
server.listen(PORT, () => {
  console.log(`Servidor escuchando http://localhost:${PORT}`);
});
