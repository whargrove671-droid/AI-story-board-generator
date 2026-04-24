const https = require('https');
const fs = require('fs');
const path = require('path');

async function testUpload() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/media/test_upload_script.txt';
  const token = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  
  const content = 'Hello world from stream!';
  const tempPath = path.join(__dirname, 'test.txt');
  fs.writeFileSync(tempPath, content);
  const stat = fs.statSync(tempPath);

  const req = https.request(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': token,
      'Content-Type': 'text/plain',
      'Content-Length': stat.size,
      'x-upsert': 'true'
    }
  }, (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      console.log('Response:', data);
    });
  });

  req.on('error', (e) => {
    console.error('Request Error:', e);
  });

  const fileStream = fs.createReadStream(tempPath);
  fileStream.pipe(req);
}

testUpload();
