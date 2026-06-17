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
  var username = 'test_fp_' + Date.now();
  console.log('=== 1. 注册用户:', username, '===');
  var reg = await apiCall('POST', '/api/auth/register', { username: username, password: '123456' });
  var token = reg.data.token;
  console.log('注册成功!');

  console.log('\n=== 2. 添加足迹 (查看详细错误) ===');
  var fpData = {
    name: '北京天安门',
    date: '2026-06-15',
    feeling: '很壮观',
    mood: 5,
    lat: 39.9042,
    lng: 116.4074
  };
  console.log('发送数据:', JSON.stringify(fpData));
  var fp1 = await apiCall('POST', '/api/footprints', fpData, token);
  console.log('Status:', fp1.status);
  console.log('响应数据:', JSON.stringify(fp1.data));
}

test().catch(console.error);
