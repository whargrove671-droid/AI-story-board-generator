import OpenAI from 'openai';

async function testOpenAI() {
  const apiKey = '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';
  console.log("Using API Key:", apiKey ? "Set" : "Not set");
  const openai = new OpenAI({
    apiKey: apiKey,
  });

  try {
    const prompt = `You are a creative storytelling AI. Given a story idea, create a detailed 5-scene narrative.

Story Idea: "A test story"

Return exactly 5 scenes.

Rules:
- Each scene should be 3-4 sentences
- Each image prompt should be detailed and visual
- Keep the story cohesive across all 5 scenes
- Make scenes cinematic and engaging
- Image prompts should work well with AI image generators like DALL-E or Stable Diffusion`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'You are a creative storytelling assistant that generates engaging 5-scene narratives with detailed image prompts. You MUST return a JSON object containing a "scenes" array. Each object in the array must have "script" and "imagePrompt" string fields.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 2000,
    });

    console.log("Response:", completion.choices[0]?.message?.content);
  } catch (error) {
    console.error("Error:", error);
  }
}

testOpenAI();
