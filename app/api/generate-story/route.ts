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
    const storyLength = body.storyLength || 5;
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

    const imageInterval = storyLength >= 120 ? 6 : 4;
    const batchSize = 10;
    const scenes: Array<{ script: string; imagePrompt: string }> = [];
    let previousContext = "";

    let startIdx = 0;
    while (startIdx < storyLength) {
      const currentBatchSize = Math.min(batchSize, storyLength - startIdx);
      const endIdx = startIdx + currentBatchSize;

      const expectedImageScenes = [];
      for (let i = startIdx; i < endIdx; i++) {
        if (i % imageInterval === 0) {
          expectedImageScenes.push(i + 1);
        }
      }
      
      const imagePromptRule = expectedImageScenes.length > 0 
        ? `- Provide a detailed, cinematic \`imagePrompt\` ONLY for the following scene numbers: ${expectedImageScenes.join(', ')}.\n- For all other scenes, the \`imagePrompt\` MUST be an empty string "".`
        : `- The \`imagePrompt\` MUST be an empty string "" for ALL scenes in this batch.`;

      const prompt = `You are a creative storytelling AI. Given a story idea, create a detailed narrative. You are generating a batch of scenes for a longer story.
Overall story length is ${storyLength} scenes. You are currently generating scenes ${startIdx + 1} to ${endIdx}.

Story Idea: "${storyIdea}"
${previousContext ? `\nPrevious Scene Summary (for continuity, DO NOT regenerate this scene, continue the story from here):\n"${previousContext}"\n` : ''}
Return exactly ${currentBatchSize} scenes for this batch.

Rules:
- Each scene should be 3-4 sentences.
${imagePromptRule}
- Keep the story cohesive across the narrative
- Make scenes cinematic and engaging
- When providing an image prompt, ensure it works well with AI image generators`;

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              `You are a creative storytelling assistant that generates engaging narratives with sparse image prompts. You MUST return a JSON object containing a "scenes" array. Each object in the array must have "script" and "imagePrompt" string fields.`,
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 8000,
      });

      const generatedText = completion.choices[0]?.message?.content;

      if (!generatedText) {
        throw new Error('No content generated from OpenAI');
      }

      let batchScenes: Array<{ script: string; imagePrompt: string }> = [];
      try {
        const parsed = JSON.parse(generatedText);
        batchScenes = parsed.scenes || [];
      } catch (e) {
        console.error('Failed to parse OpenAI JSON response:', e);
      }
      
      if (!Array.isArray(batchScenes) || batchScenes.length === 0) {
        throw new Error('Failed to generate scenes in batch or invalid format returned from AI');
      }

      // Trim if the model generated too many
      if (batchScenes.length > currentBatchSize) {
        batchScenes = batchScenes.slice(0, currentBatchSize);
      }

      scenes.push(...batchScenes);
      
      const lastScene = batchScenes[batchScenes.length - 1];
      previousContext = `Scene ${startIdx + batchScenes.length}: "${String(lastScene?.script || '').substring(0, 500)}..."`;
      
      startIdx += batchScenes.length;
    }

    if (scenes.length !== storyLength) {
      console.error(`Expected ${storyLength} scenes, got:`, scenes.length);
    }

    for (let i = 0; i < scenes.length && i < storyLength; i++) {
      const scene = scenes[i];
      const imagePrompt = scene.imagePrompt?.trim() || '';
      const imageStatus = imagePrompt ? 'pending' : 'skipped';

      const { error } = await supabase.from('scenes').insert({
        story_id: storyId,
        scene_number: i + 1,
        script: scene.script,
        image_prompt: imagePrompt,
        image_status: imageStatus,
      });

      if (error) {
        console.error('Error inserting scene:', error);
      }
    }

    await supabase
      .from('stories')
      .update({ status: 'completed' })
      .eq('id', storyId);

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
