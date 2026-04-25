const fetch = require('node-fetch') || globalThis.fetch;

async function testTogether() {
  try {
    const response = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer tgp_v1_TSob3mMUSetMzX-YrBC629797A-wsJfaxsBU4_54kXY`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-schnell',
        prompt: 'A quick test prompt. Cinematic, high quality, detailed, 16:9 aspect ratio',
        width: 1024,
        height: 576,
        steps: 4,
        n: 1,
      }),
    });
    
    if (response.ok) {
      console.log('Together API is working.');
    } else {
      const text = await response.text();
      console.log('Together API failed:', response.status, text);
    }
  } catch (err) {
    console.error('Network Error:', err);
  }
}

testTogether();
