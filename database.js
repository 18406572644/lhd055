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
const stmtDistinctDates = db.prepare('SELECT COUNT(DISTINCT date) as days FROM footprints');
const stmtFavoriteMonth = db.prepare(`
  SELECT strftime('%m', date) as month, COUNT(*) as cnt
  FROM footprints
  GROUP BY month
  ORDER BY cnt DESC
  LIMIT 1
`);
const stmtMoodDistribution = db.prepare(`
  SELECT mood, COUNT(*) as cnt
  FROM footprints
  GROUP BY mood
  ORDER BY mood ASC
`);
const stmtMonthlyTrend = db.prepare(`
  SELECT strftime('%Y-%m', date) as month, COUNT(*) as cnt
  FROM footprints
  GROUP BY month
  ORDER BY month ASC
`);
const stmtYearlyData = db.prepare(`
  SELECT 
    strftime('%Y', date) as year,
    COUNT(*) as total,
    COUNT(DISTINCT date) as days,
    COUNT(DISTINCT name) as cities
  FROM footprints
  WHERE strftime('%Y', date) IN (?, ?)
  GROUP BY year
  ORDER BY year DESC
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

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const PROVINCE_KEYWORDS = [
  '北京', '天津', '上海', '重庆',
  '河北', '山西', '辽宁', '吉林', '黑龙江',
  '江苏', '浙江', '安徽', '福建', '江西', '山东',
  '河南', '湖北', '湖南', '广东', '海南',
  '四川', '贵州', '云南', '陕西', '甘肃', '青海', '台湾',
  '内蒙古', '广西', '西藏', '宁夏', '新疆',
  '香港', '澳门'
];

const COUNTRY_KEYWORDS = [
  '中国', '日本', '韩国', '朝鲜', '蒙古',
  '越南', '泰国', '柬埔寨', '老挝', '缅甸', '马来西亚', '新加坡', '印度尼西亚', '菲律宾', '文莱',
  '印度', '巴基斯坦', '孟加拉', '尼泊尔', '不丹', '斯里兰卡', '马尔代夫',
  '哈萨克', '吉尔吉斯', '塔吉克', '乌兹别克', '土库曼',
  '阿富汗', '伊朗', '伊拉克', '叙利亚', '约旦', '黎巴嫩', '以色列', '巴勒斯坦', '沙特', '阿联酋', '卡塔尔', '科威特', '巴林', '阿曼', '也门',
  '土耳其', '塞浦路斯',
  '芬兰', '瑞典', '挪威', '丹麦', '冰岛',
  '英国', '爱尔兰', '荷兰', '比利时', '卢森堡', '法国', '摩纳哥',
  '德国', '奥地利', '瑞士', '列支敦士登',
  '波兰', '捷克', '斯洛伐克', '匈牙利', '斯洛文尼亚', '克罗地亚', '波黑', '塞尔维亚', '黑山', '北马其顿', '阿尔巴尼亚',
  '罗马尼亚', '保加利亚', '希腊',
  '俄罗斯', '乌克兰', '白俄罗斯', '摩尔多瓦', '爱沙尼亚', '拉脱维亚', '立陶宛',
  '埃及', '利比亚', '突尼斯', '阿尔及利亚', '摩洛哥',
  '苏丹', '南苏丹', '埃塞俄比亚', '厄立特里亚', '吉布提', '索马里', '肯尼亚', '坦桑尼亚', '乌干达', '卢旺达', '布隆迪', '塞舌尔',
  '毛里塔尼亚', '塞内加尔', '冈比亚', '马里', '布基纳法索', '佛得角', '几内亚', '塞拉利昂', '利比里亚', '科特迪瓦', '加纳', '多哥', '贝宁', '尼日尔', '尼日利亚',
  '乍得', '中非', '喀麦隆', '赤道几内亚', '加蓬', '刚果', '扎伊尔', '圣多美',
  '赞比亚', '安哥拉', '津巴布韦', '马拉维', '莫桑比克', '博茨瓦纳', '纳米比亚', '南非', '斯威士兰', '莱索托', '马达加斯加', '科摩罗', '毛里求斯',
  '加拿大', '美国', '墨西哥', '格陵兰',
  '危地马拉', '伯利兹', '萨尔瓦多', '洪都拉斯', '尼加拉瓜', '哥斯达黎加', '巴拿马',
  '古巴', '海地', '多米尼加', '牙买加', '巴哈马',
  '哥伦比亚', '委内瑞拉', '圭亚那', '苏里南', '厄瓜多尔', '秘鲁', '玻利维亚', '巴西', '智利', '阿根廷', '乌拉圭', '巴拉圭',
  '澳大利亚', '新西兰', '巴布亚', '所罗门', '瓦努阿图', '斐济', '萨摩亚', '汤加',
  '京都', '大阪', '东京', '北海道', '冲绳', '首尔', '釜山', '济州', '曼谷', '清迈', '普吉', '巴厘', '新加坡', '吉隆坡', '马六甲', '河内', '胡志明', '暹粒', '金边',
  '巴黎', '伦敦', '罗马', '米兰', '威尼斯', '佛罗伦萨', '柏林', '慕尼黑', '法兰克福', '阿姆斯特丹', '布鲁塞尔', '苏黎世', '日内瓦', '维也纳', '布拉格', '布达佩斯', '巴塞罗那', '马德里', '里斯本', '雅典', '圣彼得堡', '莫斯科', '冰岛',
  '纽约', '洛杉矶', '旧金山', '西雅图', '芝加哥', '波士顿', '华盛顿', '拉斯维加斯', '夏威夷', '多伦多', '温哥华', '蒙特利尔',
  '悉尼', '墨尔本', '布里斯班', '黄金海岸', '珀斯', '阿德莱德', '奥克兰', '皇后镇',
  '开罗', '开普敦', '约翰内斯堡', '马拉喀什', '突尼斯城',
  '里约', '圣保罗', '布宜诺斯艾利斯', '利马', '圣地亚哥', '波哥大', '加拉加斯',
  '迪拜', '阿布扎比', '多哈', '利雅得', '伊斯坦布尔', '开罗', '德黑兰'
];

function parseRegions(names) {
  const provinces = new Set();
  const countries = new Set();

  names.forEach(name => {
    let matched = false;
    PROVINCE_KEYWORDS.forEach(kw => {
      if (name.includes(kw)) {
        provinces.add(kw);
        countries.add('中国');
        matched = true;
      }
    });
    if (!matched) {
      COUNTRY_KEYWORDS.forEach(kw => {
        if (name.includes(kw)) {
          countries.add(kw);
          matched = true;
        }
      });
    }
    if (!matched) {
      countries.add('未知');
    }
  });

  return {
    provinces: provinces.size,
    countries: countries.has('未知') && countries.size === 1 ? 0 : countries.size
  };
}

function getStats() {
  const total = stmtCount.get().total;
  const cities = stmtDistinctCities.get().cities;
  const travelDays = stmtDistinctDates.get().days;
  const favRow = stmtFavoriteMonth.get();
  const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  const favoriteMonth = favRow ? monthNames[parseInt(favRow.month, 10) - 1] : '暂无';

  const moodRows = stmtMoodDistribution.all();
  const moodDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  moodRows.forEach(row => {
    moodDistribution[row.mood] = row.cnt;
  });

  const monthlyRows = stmtMonthlyTrend.all();
  const monthlyTrend = {};
  monthlyRows.forEach(row => {
    monthlyTrend[row.month] = row.cnt;
  });

  const allFps = stmtGetAll.all();
  const fpsForRegion = allFps.map(fp => fp.name || '');
  const regions = parseRegions(fpsForRegion);

  let maxDistance = 0;
  let farthestPair = null;
  for (let i = 0; i < allFps.length; i++) {
    for (let j = i + 1; j < allFps.length; j++) {
      const d = haversineDistance(allFps[i].lat, allFps[i].lng, allFps[j].lat, allFps[j].lng);
      if (d > maxDistance) {
        maxDistance = d;
        farthestPair = { from: allFps[i].name, to: allFps[j].name };
      }
    }
  }

  const currentYear = new Date().getFullYear().toString();
  const lastYear = (new Date().getFullYear() - 1).toString();
  const yearlyRows = stmtYearlyData.all(currentYear, lastYear);
  const yearlyComparison = {};
  yearlyRows.forEach(row => {
    yearlyComparison[row.year] = {
      total: row.total,
      days: row.days,
      cities: row.cities
    };
  });

  return {
    total,
    cities,
    travelDays,
    favoriteMonth,
    countries: regions.countries,
    provinces: regions.provinces,
    moodDistribution,
    monthlyTrend,
    maxDistance: Math.round(maxDistance),
    farthestPair,
    yearlyComparison: {
      currentYear,
      lastYear,
      current: yearlyComparison[currentYear] || { total: 0, days: 0, cities: 0 },
      last: yearlyComparison[lastYear] || { total: 0, days: 0, cities: 0 }
    }
  };
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
