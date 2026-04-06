import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { storyIdea, storyId } = await request.json();

    if (!storyIdea || !storyId) {
      return NextResponse.json(
        { error: 'Story idea and story ID are required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll() {
            // No-op for API routes
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const prompt = `You are a creative storytelling AI. Given a story idea, create a detailed 5-scene narrative.

Story Idea: "${storyIdea}"

Create exactly 5 scenes with the following format for each scene:

SCENE [number]:
[Write a detailed, engaging script for this scene in 3-4 sentences. Make it cinematic and descriptive.]

IMAGE_PROMPT [number]:
[Write a detailed image generation prompt that captures the visual essence of this scene. Include setting, characters, mood, lighting, and artistic style. Make it suitable for 16:9 ratio image generation.]

Rules:
- Each scene should be 3-4 sentences
- Each image prompt should be detailed and visual
- Keep the story cohesive across all 5 scenes
- Make scenes cinematic and engaging
- Image prompts should work well with AI image generators like DALL-E or Stable Diffusion`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a creative storytelling assistant that generates engaging 5-scene narratives with detailed image prompts.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
      max_tokens: 2000,
    });

    const generatedText = completion.choices[0]?.message?.content;

    if (!generatedText) {
      throw new Error('No content generated from OpenAI');
    }

    const scenes = parseScenes(generatedText);

    if (scenes.length !== 5) {
      console.error('Expected 5 scenes, got:', scenes.length);
    }

    for (let i = 0; i < scenes.length && i < 5; i++) {
      const scene = scenes[i];
      const { error } = await supabase.from('scenes').insert({
        story_id: storyId,
        scene_number: i + 1,
        script: scene.script,
        image_prompt: scene.imagePrompt,
        image_status: 'pending',
      });

      if (error) {
        console.error('Error inserting scene:', error);
      }
    }

    await supabase
      .from('stories')
      .update({ status: 'completed' })
      .eq('id', storyId);

    fetch(`${request.nextUrl.origin}/api/generate-images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyId }),
    }).catch((error) => console.error('Error triggering image generation:', error));

    return NextResponse.json({
      success: true,
      scenesCount: scenes.length,
    });
  } catch (error: any) {
    console.error('Error generating story:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate story' },
      { status: 500 }
    );
  }
}

function parseScenes(text: string): Array<{ script: string; imagePrompt: string }> {
  const scenes: Array<{ script: string; imagePrompt: string }> = [];

  const sceneRegex = /SCENE\s+(\d+):\s*([\s\S]*?)(?=IMAGE_PROMPT\s+\1:|$)/gi;
  const imagePromptRegex = /IMAGE_PROMPT\s+(\d+):\s*([\s\S]*?)(?=SCENE\s+\d+:|$)/gi;

  const sceneMatches = Array.from(text.matchAll(sceneRegex));
  const imagePromptMatches = Array.from(text.matchAll(imagePromptRegex));

  for (let i = 0; i < Math.min(sceneMatches.length, imagePromptMatches.length); i++) {
    const script = sceneMatches[i][2].trim();
    const imagePrompt = imagePromptMatches[i][2].trim();

    if (script && imagePrompt) {
      scenes.push({ script, imagePrompt });
    }
  }

  return scenes;
}
