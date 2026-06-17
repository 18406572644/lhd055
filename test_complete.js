const http = require('http');

function apiCall(method, path, body, token) {
  return new Promise(function (resolve, reject) {
    var bodyStr = body ? JSON.stringify(body) : null;
    var headers = {};
    if (bodyStr) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = bodyStr.length;
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
  var username = 'user_' + Date.now();
  console.log('=== 1. 注册用户:', username, '===');
  var reg = await apiCall('POST', '/api/auth/register', { username: username, password: '123456' });
  console.log('Status:', reg.status);
  var token = reg.data.token;
  var userId = reg.data.user ? reg.data.user.id : null;
  console.log('Token:', token ? token.substring(0, 20) + '...' : 'NONE');
  console.log('User ID:', userId);

  if (!token) {
    console.log('注册失败!', reg.data);
    return;
  }

  console.log('\n=== 2. 添加足迹1 (北京) ===');
  var fp1 = await apiCall('POST', '/api/footprints', {
    name: '北京天安门',
    date: '2026-06-15',
    feeling: '很壮观',
    mood: 5,
    lat: 39.9042,
    lng: 116.4074
  }, token);
  console.log('Status:', fp1.status, 'ID:', fp1.data ? fp1.data.id : null);

  console.log('\n=== 3. 添加足迹2 (上海) ===');
  var fp2 = await apiCall('POST', '/api/footprints', {
    name: '上海外滩',
    date: '2026-06-16',
    feeling: '夜景很美',
    mood: 4,
    lat: 31.2397,
    lng: 121.4998
  }, token);
  console.log('Status:', fp2.status, 'ID:', fp2.data ? fp2.data.id : null);

  console.log('\n=== 4. 查询所有足迹 ===');
  var fps = await apiCall('GET', '/api/footprints', null, token);
  console.log('Status:', fps.status, 'Count:', fps.data ? fps.data.length : 0);
  fps.data.forEach(function (fp, i) {
    console.log('  Footprint ' + (i + 1) + ': id=' + fp.id + ', name=' + fp.name + ', lat=' + fp.lat + ', lng=' + fp.lng);
  });

  console.log('\n=== 5. 用户登出后，重新登录再次查询 ===');
  var login = await apiCall('POST', '/api/auth/login', { username: username, password: '123456' });
  console.log('Login Status:', login.status);
  var newToken = login.data.token;
  var fps2 = await apiCall('GET', '/api/footprints', null, newToken);
  console.log('Footprint Count After Re-Login:', fps2.data ? fps2.data.length : 0);

  console.log('\n=== 6. 测试修改密码 (旧密码错误) ===');
  var wrongPwd = await apiCall('PUT', '/api/auth/password', {
    oldPassword: 'wrongpassword',
    newPassword: 'newpassword'
  }, newToken);
  console.log('Status:', wrongPwd.status, '(应该是400，不能是401)');
  console.log('Error:', wrongPwd.data ? wrongPwd.data.error : null);

  console.log('\n=== 7. 测试修改密码 (正确流程) ===');
  var rightPwd = await apiCall('PUT', '/api/auth/password', {
    oldPassword: '123456',
    newPassword: '654321'
  }, newToken);
  console.log('Status:', rightPwd.status, '(应该是200)');
  console.log('Response:', rightPwd.data);

  console.log('\n=== 8. 用新密码登录 ===');
  var login2 = await apiCall('POST', '/api/auth/login', { username: username, password: '654321' });
  console.log('Login with new password Status:', login2.status);
  console.log('Result:', login2.data.error ? '失败: ' + login2.data.error : '成功!');

  console.log('\n=== 9. 查询统计数据 ===');
  var stats = await apiCall('GET', '/api/stats', null, login2.data.token);
  console.log('Status:', stats.status);
  console.log('Total footprints:', stats.data.total);
}

test().catch(console.error);
