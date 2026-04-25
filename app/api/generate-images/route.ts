import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

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

    // Process only the first pending scene to prevent serverless timeouts
    const scene = scenes[0];

    try {
      await supabase
        .from('scenes')
        .update({ image_status: 'generating' })
        .eq('id', scene.id);

      let response;
      let retries = 3;
      let attempt = 0;
      let lastErrorText = '';
      
      while (attempt < retries) {
        try {
          response = await fetch('https://api.together.xyz/v1/images/generations', {
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

          if (response.ok) {
            break;
          }

          lastErrorText = await response.text();
          if (response.status >= 500 || response.status === 429) {
            console.warn(`Together AI error ${response.status} on attempt ${attempt + 1}: ${lastErrorText}. Retrying...`);
            attempt++;
            if (attempt >= retries) {
              throw new Error(`Together AI API error: ${response.status} ${response.statusText} - ${lastErrorText}`);
            }
            await new Promise((resolve) => setTimeout(resolve, 2000 * Math.pow(2, attempt - 1)));
          } else {
            throw new Error(`Together AI API error: ${response.status} ${response.statusText} - ${lastErrorText}`);
          }
        } catch (fetchError: any) {
          console.warn(`Network error on attempt ${attempt + 1}: ${fetchError.message}. Retrying...`);
          lastErrorText = fetchError.message;
          attempt++;
          if (attempt >= retries) {
            throw new Error(`Network error failed after ${retries} attempts: ${fetchError.message}`);
          }
          await new Promise((resolve) => setTimeout(resolve, 2000 * Math.pow(2, attempt - 1)));
        }
      }

      if (!response || !response.ok) {
        throw new Error(`Failed to generate image after retries. Last error: ${lastErrorText}`);
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

    } catch (error: any) {
      console.error(`Error generating image for scene ${scene.id}:`, error);

      await supabase
        .from('scenes')
        .update({ image_status: 'failed' })
        .eq('id', scene.id);
    }

    return NextResponse.json({
      success: true,
      processedScenes: 1,
      morePending: scenes.length > 1,
    });
  } catch (error: any) {
    console.error('Error generating images:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate images' },
      { status: 500 }
    );
  }
}
