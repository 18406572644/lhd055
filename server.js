const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');
const sharp = require('sharp');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, 'uploads');
const ORIGINAL_DIR = path.join(UPLOAD_DIR, 'original');
const THUMB_DIR = path.join(UPLOAD_DIR, 'thumb');
const MEDIUM_DIR = path.join(UPLOAD_DIR, 'medium');

[UPLOAD_DIR, ORIGINAL_DIR, THUMB_DIR, MEDIUM_DIR].forEach(dir => {
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

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/api/footprints', (req, res) => {
  try {
    const footprints = db.getAll();
    const result = footprints.map(fp => {
      const images = db.getImages(fp.id);
      return { ...fp, images };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/footprints', (req, res) => {
  try {
    const { name, date, feeling, mood, lat, lng } = req.body;
    if (!name || !date || lat == null || lng == null) {
      return res.status(400).json({ error: 'name, date, lat, lng are required' });
    }
    const footprint = db.create({
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

app.delete('/api/footprints/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
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
    const result = db.remove(id);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Footprint not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stats', (req, res) => {
  try {
    const stats = db.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/footprints/:id/images', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!db.getById(id)) {
      return res.status(404).json({ error: 'Footprint not found' });
    }
    const images = db.getImages(id);
    res.json(images);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/footprints/:id/images', upload.array('images', 20), async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!db.getById(id)) {
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

app.delete('/api/footprints/:id/images/:imageId', (req, res) => {
  try {
    const footprintId = parseInt(req.params.id, 10);
    const imageId = parseInt(req.params.imageId, 10);
    if (!db.getById(footprintId)) {
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

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`🌍 旅行足迹地图服务已启动: http://localhost:${PORT}`);
});
