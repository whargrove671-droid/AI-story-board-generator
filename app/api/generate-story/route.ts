import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GenerateStorySchema } from '@/lib/validations';
import { getAuthenticatedUser, verifyStoryOwnership } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
  let storyId: string | undefined;

  try {
    // 1. Authenticate user
    const { supabase, user } = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Validate input
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }

    const validation = GenerateStorySchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }

    const { storyIdea, storyLength, storyId: validatedStoryId } = validation.data;
    storyId = validatedStoryId;

    // 3. Authorize story ownership (IDOR check)
    const story = await verifyStoryOwnership(supabase, storyId, user.id);
    if (!story) {
      return NextResponse.json({ error: 'Story not found or unauthorized' }, { status: 404 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'OpenAI API key is not configured on the server' },
        { status: 500 }
      );
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

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

    const scenesToInsert = scenes.slice(0, storyLength).map((scene, i) => {
      const imagePrompt = typeof scene?.imagePrompt === 'string' ? scene.imagePrompt.trim() : '';
      const imageStatus = imagePrompt ? 'pending' : 'skipped';

      let scriptContent = scene?.script || (scene as any)?.text || (scene as any)?.narration || (scene as any)?.content;
      if (!scriptContent || typeof scriptContent !== 'string') {
        scriptContent = `[Scene ${i + 1} narration missing. AI generated an empty response.]`;
      }

      return {
        story_id: storyId,
        scene_number: i + 1,
        script: scriptContent,
        image_prompt: imagePrompt,
        image_status: imageStatus,
      };
    });

    const { error: insertError } = await supabase.from('scenes').insert(scenesToInsert);

    if (insertError) {
      console.error('Error inserting scenes:', insertError);
      throw new Error(`Failed to save scenes: ${insertError.message}`);
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
        const { supabase } = await getAuthenticatedUser(request);
        await supabase
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
