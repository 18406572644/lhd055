const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'footprints.db'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS footprints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date TEXT NOT NULL,
    feeling TEXT DEFAULT '',
    mood INTEGER DEFAULT 3 CHECK(mood BETWEEN 1 AND 5),
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS footprint_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    footprint_id INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    filename TEXT NOT NULL,
    path TEXT NOT NULL,
    thumb_path TEXT NOT NULL,
    medium_path TEXT NOT NULL,
    size INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (footprint_id) REFERENCES footprints(id) ON DELETE CASCADE
  )
`);

const stmtGetAll = db.prepare('SELECT * FROM footprints ORDER BY date DESC, created_at DESC');
const stmtGetById = db.prepare('SELECT * FROM footprints WHERE id = ?');
const stmtInsert = db.prepare('INSERT INTO footprints (name, date, feeling, mood, lat, lng) VALUES (@name, @date, @feeling, @mood, @lat, @lng)');
const stmtDelete = db.prepare('DELETE FROM footprints WHERE id = ?');
const stmtCount = db.prepare('SELECT COUNT(*) as total FROM footprints');
const stmtDistinctCities = db.prepare('SELECT COUNT(DISTINCT name) as cities FROM footprints');
const stmtFavoriteMonth = db.prepare(`
  SELECT strftime('%m', date) as month, COUNT(*) as cnt
  FROM footprints
  GROUP BY month
  ORDER BY cnt DESC
  LIMIT 1
`);

const stmtGetImagesByFootprintId = db.prepare('SELECT * FROM footprint_images WHERE footprint_id = ? ORDER BY sort_order ASC, created_at ASC');
const stmtGetImageById = db.prepare('SELECT * FROM footprint_images WHERE id = ?');
const stmtInsertImage = db.prepare(`
  INSERT INTO footprint_images 
  (footprint_id, original_name, filename, path, thumb_path, medium_path, size, sort_order)
  VALUES (@footprint_id, @original_name, @filename, @path, @thumb_path, @medium_path, @size, @sort_order)
`);
const stmtDeleteImage = db.prepare('DELETE FROM footprint_images WHERE id = ?');
const stmtDeleteImagesByFootprintId = db.prepare('DELETE FROM footprint_images WHERE footprint_id = ?');

function getAll() {
  return stmtGetAll.all();
}

function getById(id) {
  return stmtGetById.get(id);
}

function create(data) {
  const result = stmtInsert.run(data);
  return stmtGetById.get(result.lastInsertRowid);
}

function remove(id) {
  return stmtDelete.run(id);
}

function getStats() {
  const total = stmtCount.get().total;
  const cities = stmtDistinctCities.get().cities;
  const favRow = stmtFavoriteMonth.get();
  const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  const favoriteMonth = favRow ? monthNames[parseInt(favRow.month, 10) - 1] : '暂无';
  return { total, cities, favoriteMonth };
}

function getImages(footprintId) {
  return stmtGetImagesByFootprintId.all(footprintId);
}

function getImage(id) {
  return stmtGetImageById.get(id);
}

function addImage(data) {
  const result = stmtInsertImage.run(data);
  return stmtGetImageById.get(result.lastInsertRowid);
}

function removeImage(id) {
  return stmtDeleteImage.run(id);
}

function removeImagesByFootprint(footprintId) {
  return stmtDeleteImagesByFootprintId.run(footprintId);
}

module.exports = {
  getAll, getById, create, remove, getStats,
  getImages, getImage, addImage, removeImage, removeImagesByFootprint
};
