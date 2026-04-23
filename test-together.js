async function testTogether() {
  const apiKey = 'key_CZmAzB75R7aXL4cEuTXuP';
  console.log("Using API Key:", apiKey);
  try {
    const response = await fetch('https://api.together.xyz/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'black-forest-labs/FLUX.1-schnell-Free',
        prompt: `A cute cat. Cinematic, high quality, detailed, 16:9 aspect ratio`,
        width: 1024,
        height: 576,
        steps: 4,
        n: 1,
      }),
    });

    console.log("Status:", response.status, response.statusText);
    const data = await response.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error:", error);
  }
}

testTogether();
