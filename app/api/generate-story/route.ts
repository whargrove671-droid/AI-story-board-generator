import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import OpenAI from 'openai';

export async function POST(request: NextRequest) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "dummy",
  });

  let storyId: string | undefined;

  try {
    const body = await request.json();
    const storyIdea = body.storyIdea;
    storyId = body.storyId;

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

    const generatedText = completion.choices[0]?.message?.content;

    if (!generatedText) {
      throw new Error('No content generated from OpenAI');
    }

    let scenes: Array<{ script: string; imagePrompt: string }> = [];
    try {
      const parsed = JSON.parse(generatedText);
      scenes = parsed.scenes || [];
    } catch (e) {
      console.error('Failed to parse OpenAI JSON response:', e);
    }

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

    const cookieHeader = request.headers.get('cookie');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (cookieHeader) {
      headers['Cookie'] = cookieHeader;
    }

    fetch(`${request.nextUrl.origin}/api/generate-images`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ storyId }),
    }).catch((error) => console.error('Error triggering image generation:', error));

    return NextResponse.json({
      success: true,
      scenesCount: scenes.length,
    });
  } catch (error: any) {
    console.error('Error generating story:', error);
    
    // Fallback to update story status to failed so it doesn't get stuck in generating
    if (storyId) {
      try {
        const supabaseFallback = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            cookies: {
              getAll() {
                return request.cookies.getAll();
              },
              setAll() {},
            },
          }
        );
        await supabaseFallback
          .from('stories')
          .update({ status: 'failed' })
          .eq('id', storyId);
      } catch (e) {
        console.error('Failed to update story status to failed:', e);
      }
    }

    return NextResponse.json(
      { error: error.message || 'Failed to generate story' },
      { status: 500 }
    );
  }
}
