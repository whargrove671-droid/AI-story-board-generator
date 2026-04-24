import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import OpenAI from 'openai';
import { YoutubeTranscript } from 'youtube-transcript';

export async function POST(request: NextRequest) {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY || "dummy",
  });

  let storyId: string | undefined;

  try {
    const body = await request.json();
    const youtubeUrl = body.youtubeUrl;
    storyId = body.storyId;

    if (!youtubeUrl || !storyId) {
      return NextResponse.json(
        { error: 'YouTube URL and story ID are required' },
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

    // 1. Fetch YouTube Transcript
    console.log(`Fetching transcript for: ${youtubeUrl}`);
    let transcriptData;
    try {
      transcriptData = await YoutubeTranscript.fetchTranscript(youtubeUrl);
    } catch (e: any) {
      throw new Error(`Failed to fetch YouTube transcript: ${e.message}`);
    }

    if (!transcriptData || transcriptData.length === 0) {
      throw new Error('No transcript found for this video. Please ensure the video has closed captions enabled.');
    }

    const fullTranscript = transcriptData.map((item: any) => item.text).join(' ');
    console.log(`Successfully fetched transcript: ${fullTranscript.substring(0, 100)}...`);

    // 2. Determine Optimal Story Length
    const lengthPrompt = `You are a creative storytelling assistant.
Given the following YouTube video transcript, estimate the optimal number of scenes needed to turn this into a comprehensive storyboard narrative without omitting important details.
Each scene in the narrative will be 2-3 detailed paragraphs.
Return ONLY a valid JSON object with a single numeric field "storyLength".

Transcript preview (first 15000 chars):
${fullTranscript.substring(0, 15000)}`;

    const lengthCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: lengthPrompt }],
      temperature: 0.2,
    });

    const lengthResult = lengthCompletion.choices[0]?.message?.content;
    let storyLength = 5; // default fallback
    try {
      const parsedLength = JSON.parse(lengthResult || '{}');
      if (typeof parsedLength.storyLength === 'number') {
        storyLength = Math.max(1, parsedLength.storyLength);
      }
    } catch (e) {
      console.error('Failed to parse optimal story length, defaulting to 5', e);
    }

    console.log(`Optimal story length determined as: ${storyLength}`);

    // 3. Batch Generate Scenes
    const imageInterval = storyLength >= 30 ? 6 : 4;
    const batchSize = 10;
    const allScenes: Array<{ script: string; imagePrompt: string }> = [];
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

      const prompt = `You are a creative storytelling AI rewriting a YouTube video transcript into a storyboard narrative. You are generating a batch of scenes for a longer story.
Overall story length is ${storyLength} scenes. You are currently generating scenes ${startIdx + 1} to ${endIdx}.

Source Transcript:
"${fullTranscript}"

${previousContext ? `\nPrevious Scene Summary (for continuity, DO NOT regenerate this scene, continue the story from here):\n"${previousContext}"\n` : ''}
Return exactly ${currentBatchSize} scenes for this batch.

Rules:
- Each scene MUST be 2-3 detailed paragraphs.
${imagePromptRule}
- Keep the story cohesive across the narrative. Do not stray from the source transcript content, but rewrite it into an engaging narrative format.
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
        max_tokens: 16000,
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

      allScenes.push(...batchScenes);
      
      const lastScene = batchScenes[batchScenes.length - 1];
      previousContext = `Scene ${startIdx + batchScenes.length}: "${String(lastScene?.script || '').substring(0, 500)}..."`;
      
      startIdx += batchScenes.length;
    }

    // 4. Save to Database
    for (let i = 0; i < allScenes.length && i < storyLength; i++) {
      const scene = allScenes[i];
      const imagePrompt = typeof scene?.imagePrompt === 'string' ? scene.imagePrompt.trim() : '';
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
      scenesCount: allScenes.length,
      determinedStoryLength: storyLength
    });
  } catch (error: any) {
    console.error('Error generating story from YouTube:', error);
    
    if (storyId) {
      try {
        const supabaseFallback = createServerClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
          {
            cookies: {
              getAll() { return request.cookies.getAll(); },
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
      { error: error.message || 'Failed to generate story from YouTube' },
      { status: 500 }
    );
  }
}
