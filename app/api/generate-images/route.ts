import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function POST(request: NextRequest) {
  try {
    const { storyId, retryFailed } = await request.json();

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

    if (retryFailed) {
      await supabase
        .from('scenes')
        .update({ image_status: 'pending' })
        .eq('story_id', storyId)
        .eq('image_status', 'failed');
    }

    const { data: scenes, error: scenesError } = await supabase
      .from('scenes')
      .select('*')
      .eq('story_id', storyId)
      .eq('image_status', 'pending')
      .order('scene_number', { ascending: true });

    if (scenesError) {
      throw scenesError;
    }

    if (!scenes || scenes.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending scenes to generate images for',
      });
    }

    for (const scene of scenes) {
      try {
        await supabase
          .from('scenes')
          .update({ image_status: 'generating' })
          .eq('id', scene.id);

        const response = await fetch('https://api.together.xyz/v1/images/generations', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'black-forest-labs/FLUX.1-schnell',
            prompt: `${scene.image_prompt}. Cinematic, high quality, detailed, 16:9 aspect ratio`,
            width: 1024,
            height: 576,
            steps: 4,
            n: 1,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Together AI API error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const data = await response.json();
        const ephemeralUrl = data.data?.[0]?.url;

        if (ephemeralUrl) {
          console.log(`Downloading ephemeral image for scene ${scene.id}...`);
          const imgResponse = await fetch(ephemeralUrl);
          if (!imgResponse.ok) throw new Error('Failed to download image from Together AI');
          
          const arrayBuffer = await imgResponse.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const fileName = `story_${storyId}_scene_${scene.id}.png`;

          console.log(`Uploading image to Supabase Storage...`);
          const { error: uploadError } = await supabase.storage
            .from('media')
            .upload(fileName, buffer, {
              contentType: 'image/png',
              upsert: true,
            });

          if (uploadError) throw uploadError;

          const { data: publicUrlData } = supabase.storage
            .from('media')
            .getPublicUrl(fileName);

          const permanentUrl = publicUrlData.publicUrl;

          await supabase
            .from('scenes')
            .update({
              image_url: permanentUrl,
              image_status: 'completed',
            })
            .eq('id', scene.id);
        } else {
          throw new Error('No image URL returned');
        }

        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error: any) {
        console.error(`Error generating image for scene ${scene.id}:`, error);

        await supabase
          .from('scenes')
          .update({ image_status: 'failed' })
          .eq('id', scene.id);
      }
    }

    return NextResponse.json({
      success: true,
      processedScenes: scenes.length,
    });
  } catch (error: any) {
    console.error('Error generating images:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate images' },
      { status: 500 }
    );
  }
}
