import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';

// Set the ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Helper function to download a file
async function downloadFile(url: string, outputPath: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  if (!response.body) throw new Error(`No body for ${url}`);
  
  const fileStream = fs.createWriteStream(outputPath);
  // @ts-ignore - ReadableStream types between DOM and Node can clash, but pipeline works
  await pipeline(response.body, fileStream);
}

// Helper function to create a video segment from image and audio
function createSegment(imagePath: string, audioPath: string, text: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // We burn subtitles at the bottom
    // We have to escape colons and backslashes for the drawtext filter
    const safeText = text
      .replace(/'/g, "\\'")
      .replace(/:/g, '\\:')
      .replace(/\n/g, ' ')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      // Break into lines roughly every 50 characters (simple word wrap)
      .match(/(?=.{1,50}\s|.{1,50}$)[^ \n]+(?: [^ \n]+)*/g)?.join('\\n') || text;

    ffmpeg()
      .input(imagePath)
      .inputOptions(['-loop 1'])
      .input(audioPath)
      .outputOptions([
        '-c:v libx264',
        '-c:a aac',
        '-b:a 192k',
        '-pix_fmt yuv420p',
        '-shortest',
        // Draw text with a semi-transparent black box background
        `-vf drawtext=text='${safeText}':fontcolor=white:fontsize=36:box=1:boxcolor=black@0.6:boxborderw=10:x=(w-text_w)/2:y=h-text_h-50:line_spacing=10:text_align=C`
      ])
      .save(outputPath)
      .on('end', () => resolve())
      .on('error', (err: any) => reject(err));
  });
}

// Helper to concatenate segments
function concatenateSegments(segmentPaths: string[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const command = ffmpeg();
    segmentPaths.forEach(p => command.input(p));
    
    command
      .on('end', () => resolve())
      .on('error', (err: any) => reject(err))
      .mergeToFile(outputPath, os.tmpdir());
  });
}

export async function POST(request: NextRequest) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-gen-'));
  
  try {
    const { storyId } = await request.json();

    if (!storyId) {
      return NextResponse.json({ error: 'Story ID is required' }, { status: 400 });
    }

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() { return request.cookies.getAll(); },
          setAll() {},
        },
      }
    );

    // Get story
    const { data: story, error: storyError } = await supabase
      .from('stories')
      .select('*')
      .eq('id', storyId)
      .single();

    if (storyError) throw storyError;

    // Get scenes
    const { data: scenes, error: scenesError } = await supabase
      .from('scenes')
      .select('*')
      .eq('story_id', storyId)
      .order('scene_number', { ascending: true });

    if (scenesError) throw scenesError;

    if (!scenes || scenes.length === 0) {
      return NextResponse.json({ error: 'No scenes found' }, { status: 400 });
    }

    // Check if all audios are generated
    const missingAudio = scenes.find(s => !s.audio_url);
    if (missingAudio) {
      return NextResponse.json({ error: 'Not all audio files are generated yet.' }, { status: 400 });
    }

    // Update story status
    await supabase.from('stories').update({ status: 'compiling_video' }).eq('id', storyId);

    const segmentPaths: string[] = [];
    let lastImageURL = scenes[0].image_url;

    // Build segments
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (scene.image_url) lastImageURL = scene.image_url;
      if (!lastImageURL) throw new Error(`Missing image for scene ${scene.scene_number}`);

      const imgPath = path.join(tmpDir, `image_${i}.jpg`);
      const audioPath = path.join(tmpDir, `audio_${i}.mp3`);
      const outPath = path.join(tmpDir, `segment_${i}.mp4`);

      console.log(`Downloading assets for scene ${scene.scene_number}...`);
      await downloadFile(lastImageURL, imgPath);
      await downloadFile(scene.audio_url, audioPath);

      console.log(`Rendering segment ${scene.scene_number}...`);
      await createSegment(imgPath, audioPath, scene.script, outPath);
      segmentPaths.push(outPath);
    }

    const finalVideoPath = path.join(tmpDir, `final_${storyId}.mp4`);
    console.log(`Concatenating ${segmentPaths.length} segments...`);
    await concatenateSegments(segmentPaths, finalVideoPath);

    console.log(`Uploading final video to Supabase Storage...`);
    const fileBuffer = fs.readFileSync(finalVideoPath);
    const fileName = `story_${storyId}_final.mp4`;

    const { error: uploadError } = await supabase.storage
      .from('media')
      .upload(fileName, fileBuffer, {
        contentType: 'video/mp4',
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: publicUrlData } = supabase.storage.from('media').getPublicUrl(fileName);

    // Update story with video_url
    await supabase
      .from('stories')
      .update({ 
        video_url: publicUrlData.publicUrl,
        status: 'completed'
      })
      .eq('id', storyId);

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });

    return NextResponse.json({ success: true, videoUrl: publicUrlData.publicUrl });
  } catch (error: any) {
    console.error('Error compiling video:', error);
    
    // Cleanup on error
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}

    return NextResponse.json(
      { error: error.message || 'Failed to compile video' },
      { status: 500 }
    );
  }
}
