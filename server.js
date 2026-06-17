const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const jwt = require('jsonwebtoken');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'travel-footprint-map-secret-key-2024';
const JWT_EXPIRES_IN = '7d';

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars');
const ORIGINAL_DIR = path.join(UPLOAD_DIR, 'original');
const THUMB_DIR = path.join(UPLOAD_DIR, 'thumb');
const MEDIUM_DIR = path.join(UPLOAD_DIR, 'medium');

[UPLOAD_DIR, AVATAR_DIR, ORIGINAL_DIR, THUMB_DIR, MEDIUM_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, ORIGINAL_DIR);
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, timestamp + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowed = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;
    if (allowed.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, AVATAR_DIR);
    },
    filename: function (req, file, cb) {
      const timestamp = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, timestamp + ext);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    const allowed = /\.(jpg|jpeg|png|gif|webp)$/i;
    if (allowed.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(function (err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求数据格式错误' });
  }
  next(err);
});
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '请先登录' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = db.getUserById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: '登录已过期，请重新登录' });
    }
    return res.status(401).json({ error: '无效的认证信息' });
  }
}

app.post('/api/auth/register', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    if (username.length < 3 || username.length > 20) {
      return res.status(400).json({ error: '用户名长度需在3-20个字符之间' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度不能少于6个字符' });
    }
    if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username)) {
      return res.status(400).json({ error: '用户名只能包含字母、数字、下划线和中文' });
    }
    const existing = db.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: '用户名已被注册' });
    }
    const user = db.createUser(username, password);
    const token = generateToken(user);
    res.status(201).json({
      token,
      user: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar || '', bio: user.bio || '' }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    const user = db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const valid = db.verifyPassword(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const token = generateToken(user);
    res.json({
      token,
      user: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar || '', bio: user.bio || '' }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  const user = req.user;
  res.json({
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatar: user.avatar || '',
    bio: user.bio || ''
  });
});

app.put('/api/auth/profile', authMiddleware, (req, res) => {
  try {
    const { nickname, bio } = req.body;
    const updated = db.updateUserProfile(req.user.id, {
      nickname: nickname || '',
      bio: bio || '',
      avatar: req.user.avatar || ''
    });
    res.json({
      id: updated.id,
      username: updated.username,
      nickname: updated.nickname,
      avatar: updated.avatar || '',
      bio: updated.bio || ''
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/avatar', authMiddleware, avatarUpload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择图片' });
    }
    const ext = path.extname(req.file.filename);
    const baseName = path.basename(req.file.filename, ext);
    const processedName = baseName + '_avatar' + ext;
    const processedPath = path.join(AVATAR_DIR, processedName);

    try {
      await sharp(req.file.path)
        .resize(200, 200, { fit: 'cover', withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toFile(processedPath);
      fs.unlinkSync(req.file.path);
    } catch (sharpErr) {
      try { fs.renameSync(req.file.path, processedPath); } catch (e) {}
    }

    const avatarUrl = '/uploads/avatars/' + processedName;
    db.updateUserProfile(req.user.id, {
      nickname: req.user.nickname || '',
      bio: req.user.bio || '',
      avatar: avatarUrl
    });
    res.json({ avatar: avatarUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/auth/password', authMiddleware, (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请输入旧密码和新密码' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度不能少于6个字符' });
    }
    const fullUser = db.getUserByUsername(req.user.username);
    if (!fullUser) {
      return res.status(400).json({ error: '用户不存在' });
    }
    const valid = db.verifyPassword(oldPassword, fullUser.password);
    if (!valid) {
      return res.status(400).json({ error: '旧密码错误' });
    }
    db.updateUserPassword(req.user.id, newPassword);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/reset-password', (req, res) => {
  try {
    const { username, newPassword } = req.body;
    if (!username || !newPassword) {
      return res.status(400).json({ error: '用户名和新密码不能为空' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度不能少于6个字符' });
    }
    const user = db.getUserByUsername(username);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    db.updateUserPassword(user.id, newPassword);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/footprints', authMiddleware, (req, res) => {
  try {
    const footprints = db.getAll(req.user.id);
    const result = footprints.map(fp => {
      const images = db.getImages(fp.id);
      return { ...fp, images };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/footprints', authMiddleware, (req, res) => {
  try {
    const { name, date, feeling, mood, lat, lng } = req.body;
    if (!name || !date || lat == null || lng == null) {
      return res.status(400).json({ error: 'name, date, lat, lng are required' });
    }
    const footprint = db.create({
      user_id: req.user.id,
      name: name.trim(),
      date,
      feeling: feeling || '',
      mood: mood || 3,
      lat: parseFloat(lat),
      lng: parseFloat(lng)
    });
    footprint.images = [];
    res.status(201).json(footprint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/footprints/:id', authMiddleware, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const fp = db.getById(id, req.user.id);
    if (!fp) {
      return res.status(404).json({ error: 'Footprint not found' });
    }
    const images = db.getImages(id);
    images.forEach(img => {
      const files = [img.path, img.thumb_path, img.medium_path];
      files.forEach(f => {
        if (f && fs.existsSync(f)) {
          try { fs.unlinkSync(f); } catch (e) {}
        }
      });
    });
    db.removeImagesByFootprint(id);
    const result = db.remove(id, req.user.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Footprint not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', authMiddleware, (req, res) => {
  try {
    const stats = db.getStats(req.user.id);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/footprints/:id', authMiddleware, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const footprint = db.getById(id, req.user.id);
    if (!footprint) {
      return res.status(404).json({ error: 'Footprint not found' });
    }
    footprint.images = db.getImages(id);
    res.json(footprint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/footprints/:id/images', authMiddleware, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!db.getById(id, req.user.id)) {
      return res.status(404).json({ error: 'Footprint not found' });
    }
    const images = db.getImages(id);
    res.json(images);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/footprints/:id/images', authMiddleware, upload.array('images', 20), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!db.getById(id, req.user.id)) {
      return res.status(404).json({ error: 'Footprint not found' });
    }
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const savedImages = [];
    const existingCount = db.getImages(id).length;

    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      const ext = path.extname(file.filename);
      const baseName = path.basename(file.filename, ext);

      const thumbName = baseName + '_thumb' + ext;
      const mediumName = baseName + '_medium' + ext;
      const thumbPath = path.join(THUMB_DIR, thumbName);
      const mediumPath = path.join(MEDIUM_DIR, mediumName);

      try {
        await sharp(file.path)
          .resize(200, 200, { fit: 'cover', withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(thumbPath);

        await sharp(file.path)
          .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 85 })
          .toFile(mediumPath);
      } catch (sharpErr) {
        try { fs.copyFileSync(file.path, thumbPath); } catch (e) {}
        try { fs.copyFileSync(file.path, mediumPath); } catch (e) {}
      }

      const dbImg = db.addImage({
        footprint_id: id,
        original_name: file.originalname,
        filename: file.filename,
        path: file.path,
        thumb_path: thumbPath,
        medium_path: mediumPath,
        size: file.size || 0,
        sort_order: existingCount + i
      });
      savedImages.push(dbImg);
    }

    res.status(201).json(savedImages);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/footprints/:id/images/:imageId', authMiddleware, (req, res) => {
  try {
    const footprintId = parseInt(req.params.id, 10);
    const imageId = parseInt(req.params.imageId, 10);
    if (!db.getById(footprintId, req.user.id)) {
      return res.status(404).json({ error: 'Footprint not found' });
    }
    const img = db.getImage(imageId);
    if (!img || img.footprint_id !== footprintId) {
      return res.status(404).json({ error: 'Image not found' });
    }
    const files = [img.path, img.thumb_path, img.medium_path];
    files.forEach(f => {
      if (f && fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch (e) {}
      }
    });
    db.removeImage(imageId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/trips', authMiddleware, (req, res) => {
  try {
    const trips = db.getAllTrips(req.user.id);
    res.json(trips);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/trips/:id', authMiddleware, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const trip = db.getTripById(id, req.user.id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    trip.footprints = db.getTripFootprints(id);
    trip.stats = db.getTripStats(id);
    res.json(trip);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/trips', authMiddleware, (req, res) => {
  try {
    const { name, description, start_date, end_date, cover_image } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'name is required' });
    }
    const trip = db.createTrip({
      user_id: req.user.id,
      name: name.trim(),
      description: description || '',
      start_date: start_date || null,
      end_date: end_date || null,
      cover_image: cover_image || null
    });
    trip.footprints = [];
    trip.stats = db.getTripStats(trip.id);
    res.status(201).json(trip);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/trips/:id', authMiddleware, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const existing = db.getTripById(id, req.user.id);
    if (!existing) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    const trip = db.updateTrip(id, {
      ...req.body,
      user_id: req.user.id
    });
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    trip.footprints = db.getTripFootprints(id);
    trip.stats = db.getTripStats(id);
    res.json(trip);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/trips/:id', authMiddleware, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const result = db.deleteTrip(id, req.user.id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/trips/:id/footprints', authMiddleware, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!db.getTripById(id, req.user.id)) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    const footprints = db.getTripFootprints(id);
    res.json(footprints);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/trips/:id/footprints/:footprintId', authMiddleware, (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    const footprintId = parseInt(req.params.footprintId, 10);
    if (!db.getTripById(tripId, req.user.id)) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    if (!db.getById(footprintId, req.user.id)) {
      return res.status(404).json({ error: 'Footprint not found' });
    }
    const added = db.addFootprintToTrip(tripId, footprintId);
    res.json({ success: added });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/trips/:id/footprints/:footprintId', authMiddleware, (req, res) => {
  try {
    const tripId = parseInt(req.params.id, 10);
    const footprintId = parseInt(req.params.footprintId, 10);
    if (!db.getTripById(tripId, req.user.id)) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    const removed = db.removeFootprintFromTrip(tripId, footprintId);
    res.json({ success: removed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/trips/:id/stats', authMiddleware, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!db.getTripById(id, req.user.id)) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    const stats = db.getTripStats(id);
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/trips/:id/gpx', authMiddleware, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const trip = db.getTripById(id, req.user.id);
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    const gpx = db.generateGPX(id);
    const filename = (trip.name || 'trip').replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_') + '.gpx';
    res.setHeader('Content-Type', 'application/gpx+xml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(gpx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/footprints/:id/trips', authMiddleware, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!db.getById(id, req.user.id)) {
      return res.status(404).json({ error: 'Footprint not found' });
    }
    const trips = db.getTripsByFootprintId(id);
    res.json(trips);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`🌍 旅行足迹地图服务已启动: http://localhost:${PORT}`);
});
