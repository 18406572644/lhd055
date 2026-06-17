const db = require('./database.js');
const bcrypt = require('bcryptjs');

console.log('=== 测试数据库 create 函数 ===');

try {
  var username = 'dbtest_' + Date.now();
  var hashedPwd = bcrypt.hashSync('123456', 10);
  var userStmt = require('better-sqlite3')(require('path').join(__dirname, 'footprints.db'));
  var insert = userStmt.prepare('INSERT INTO users (username, password, nickname) VALUES (?, ?, ?)');
  var result = insert.run(username, hashedPwd, username);
  var userId = result.lastInsertRowid;
  console.log('创建用户 ID:', userId);

  var testData = {
    user_id: userId,
    name: '北京天安门',
    date: '2026-06-15',
    feeling: '很壮观',
    mood: 5,
    lat: 39.9042,
    lng: 116.4074
  };
  console.log('插入足迹数据:', JSON.stringify(testData));
  
  var created = db.create(testData);
  console.log('创建成功:', created);
  
  var all = db.getAll(userId);
  console.log('查询所有足迹:', all.length, '条');
  all.forEach(function (fp) {
    console.log('  - id=' + fp.id + ' name=' + fp.name);
  });
} catch (e) {
  console.error('错误:', e.message);
  console.error('栈:', e.stack);
}
