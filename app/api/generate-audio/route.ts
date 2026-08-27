import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { GenerateAudioSchema } from '@/lib/validations';
import { getAuthenticatedUser, verifyStoryOwnership } from '@/lib/auth-helpers';

export async function POST(request: NextRequest) {
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

    const validation = GenerateAudioSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: validation.error.errors[0]?.message || 'Validation error' },
        { status: 400 }
      );
    }

    const { storyId } = validation.data;

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

    // Get all scenes for the story
    const { data: scenes, error: scenesError } = await supabase
      .from('scenes')
      .select('*')
      .eq('story_id', storyId)
      .order('scene_number', { ascending: true });

    if (scenesError) {
      throw scenesError;
    }

    if (!scenes || scenes.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No scenes found',
      });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    let processedCount = 0;
    const CONCURRENCY = 5;

    const scenesToProcess = scenes.filter(
      (scene) => !scene.audio_url && scene.script && scene.script.trim() !== ''
    );

    const processScene = async (scene: any) => {
      try {
        // Clean up any leaked image prompts from the script before TTS reads it
        let cleanText = scene.script.replace(/\[image prompt.*?\]/ig, '');
        cleanText = cleanText.replace(/\(image prompt.*?\)/ig, '');
        cleanText = cleanText.replace(/\*\*image prompt.*?\*\*/ig, '');
        cleanText = cleanText.replace(/image prompt:.*$/igm, '');
        cleanText = cleanText.trim();

        if (!cleanText) {
          cleanText = `Scene ${scene.scene_number}`;
        }

        const mp3 = await openai.audio.speech.create({
          model: "tts-1",
          voice: "alloy",
          input: cleanText,
        });

        const buffer = Buffer.from(await mp3.arrayBuffer());
        const fileName = `story_${storyId}_scene_${scene.id}.mp3`;
        
        // Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(fileName, buffer, {
            contentType: 'audio/mpeg',
            upsert: true,
          });

        if (uploadError) {
          throw uploadError;
        }

        // Get public URL
        const { data: publicUrlData } = supabase.storage
          .from('media')
          .getPublicUrl(fileName);

        // Update scene with audio_url
        await supabase
          .from('scenes')
          .update({ audio_url: publicUrlData.publicUrl })
          .eq('id', scene.id);

        processedCount++;
      } catch (error: any) {
        console.error(`Error generating audio for scene ${scene.id}:`, error);
      }
    };

    // Process in batches
    for (let i = 0; i < scenesToProcess.length; i += CONCURRENCY) {
      const batch = scenesToProcess.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(processScene));
    }

    return NextResponse.json({
      success: true,
      processedAudio: processedCount,
    });
  } catch (error: any) {
    console.error('Error generating audio:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate audio' },
      { status: 500 }
    );
  }
}
