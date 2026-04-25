import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import OpenAI from 'openai';

export async function POST(request: NextRequest) {
  try {
    const { storyId } = await request.json();

    if (!storyId) {
      return NextResponse.json(
        { error: 'Story ID is required' },
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
        console.log(`Generating audio for scene ${scene.id}...`);
        
        const mp3 = await openai.audio.speech.create({
          model: "tts-1",
          voice: "alloy",
          input: scene.script,
        });

        const buffer = Buffer.from(await mp3.arrayBuffer());
        
        const fileName = `story_${storyId}_scene_${scene.id}.mp3`;
        
        // Upload to Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
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
        // We'll just log the error and continue with the next scene
      }
    };

    // Process in batches
    for (let i = 0; i < scenesToProcess.length; i += CONCURRENCY) {
      const batch = scenesToProcess.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(processScene));
    }

    // Call compile video if all audio/images are done?
    // In our architecture, the client can check if everything is ready and call compile video.

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
