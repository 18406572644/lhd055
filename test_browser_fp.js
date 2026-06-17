const http = require('http');

function apiCall(method, path, body, token) {
  return new Promise(function (resolve, reject) {
    var bodyStr = body ? JSON.stringify(body) : null;
    var headers = {};
    if (bodyStr) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(bodyStr, 'utf8');
    }
    if (token) {
      headers['Authorization'] = 'Bearer ' + token;
    }
    var options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: headers
    };
    var req = http.request(options, function (res) {
      var data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function test() {
  var username = 'browser_test_user';

  console.log('=== 1. 登录用户:', username, '===');
  var login = await apiCall('POST', '/api/auth/login', { username: username, password: '123456' });
  console.log('Status:', login.status);
  var token = login.data.token;
  console.log('Token:', token ? token.substring(0, 30) + '...' : 'NONE');

  if (!token) {
    console.log('登录失败！', login.data);
    return;
  }

  console.log('\n=== 2. 创建足迹: 北京天安门 ===');
  var fp1 = await apiCall('POST', '/api/footprints', {
    name: '北京天安门',
    date: '2026-06-15',
    feeling: '非常壮观！',
    mood: 5,
    lat: 39.9042,
    lng: 116.4074
  }, token);
  console.log('Status:', fp1.status, fp1.data.id ? ('ID=' + fp1.data.id) : JSON.stringify(fp1.data));

  console.log('\n=== 3. 创建足迹: 上海外滩 ===');
  var fp2 = await apiCall('POST', '/api/footprints', {
    name: '上海外滩',
    date: '2026-06-16',
    feeling: '夜景很美',
    mood: 4,
    lat: 31.2397,
    lng: 121.4998
  }, token);
  console.log('Status:', fp2.status, fp2.data.id ? ('ID=' + fp2.data.id) : JSON.stringify(fp2.data));

  console.log('\n=== 4. 查询所有足迹 ===');
  var fps = await apiCall('GET', '/api/footprints', null, token);
  console.log('Status:', fps.status, 'Count:', fps.data ? fps.data.length : 0);
  if (fps.data && fps.data.length > 0) {
    fps.data.forEach(function (fp, i) {
      console.log('  [' + (i + 1) + '] id=' + fp.id + ' name=' + fp.name + ' lat=' + fp.lat + ' lng=' + fp.lng);
    });
  }

  console.log('\n=== 5. 查询统计数据 ===');
  var stats = await apiCall('GET', '/api/stats', null, token);
  console.log('Status:', stats.status, JSON.stringify(stats.data));
}

test().catch(console.error);
