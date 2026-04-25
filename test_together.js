const https = require('https');

async function testTogether() {
  const postData = JSON.stringify({
    model: 'black-forest-labs/FLUX.1-schnell',
    prompt: 'A'.repeat(2000),
    width: 1024,
    height: 576,
    steps: 4,
    n: 1,
  });

  const options = {
    hostname: 'api.together.xyz',
    port: 443,
    path: '/v1/images/generations',
    method: 'POST',
    headers: {
      'Authorization': `Bearer tgp_v1_TSob3mMUSetMzX-YrBC629797A-wsJfaxsBU4_54kXY`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  const req = https.request(options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      console.log('Body:', data);
    });
  });

  req.on('error', (e) => {
    console.error('Network Error:', e.message);
  });

  req.write(postData);
  req.end();
}

testTogether();
