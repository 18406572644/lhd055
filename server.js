const express = require('express');
const path = require('path');
const cors = require('cors');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/footprints', (req, res) => {
  try {
    const footprints = db.getAll();
    res.json(footprints);
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
    res.status(201).json(footprint);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/footprints/:id', (req, res) => {
  try {
    const result = db.remove(parseInt(req.params.id, 10));
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

app.listen(PORT, () => {
  console.log(`🌍 旅行足迹地图服务已启动: http://localhost:${PORT}`);
});
