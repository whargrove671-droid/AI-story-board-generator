import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { pipeline } from 'stream/promises';

// Set the ffmpeg/ffprobe paths
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
ffmpeg.setFfprobePath(ffprobeInstaller.path);

// Helper function to download a file
async function downloadFile(url: string, outputPath: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  
  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, new Uint8Array(arrayBuffer));
}

// Helper function to create a video segment from image and audio
function createSegment(imagePath: string, audioPath: string, text: string, outputPath: string, tmpDir: string, index: number): Promise<void> {
  return new Promise((resolve, reject) => {
    // Clean up any leaked image prompts from the script
    let cleanText = text.replace(/\[image prompt.*?\]/ig, '');
    cleanText = cleanText.replace(/\(image prompt.*?\)/ig, '');
    cleanText = cleanText.replace(/\*\*image prompt.*?\*\*/ig, '');
    cleanText = cleanText.replace(/image prompt:.*$/igm, '');
    cleanText = cleanText.trim();

    // Break into lines roughly every 50 characters (simple word wrap)
    const wrappedText = cleanText
      .replace(/\n/g, ' ')
      .match(/(?=.{1,50}\s|.{1,50}$)[^ \n]+(?: [^ \n]+)*/g)?.join('\n') || cleanText;

    // Write text to a temporary file to avoid ffmpeg escaping nightmares
    const textFileName = `text_${index}.txt`;
    const textPath = path.join(tmpDir, textFileName);
    fs.writeFileSync(textPath, wrappedText, 'utf8');

    // For ffmpeg drawtext textfile on Windows, we need to escape the colon and use forward slashes
    const safeTextPath = textPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    ffmpeg()
      .input(imagePath)
      .inputOptions(['-loop', '1'])
      .input(audioPath)
      .outputOptions([
        '-c:v', 'libx264',
        '-r', '5',              // Lower framerate for static image
        '-crf', '32',           // Aggressive compression
        '-preset', 'veryfast',  // Faster encoding
        '-c:a', 'aac',
        '-b:a', '48k',          // Lower audio bitrate for voice
        '-pix_fmt', 'yuv420p',
        '-shortest',
        // Strip trailing and leading silence from the TTS audio
        '-af', 'silenceremove=start_periods=1:start_duration=0.05:start_threshold=-25dB,areverse,silenceremove=start_periods=1:start_duration=0.05:start_threshold=-25dB,areverse',
        // Draw text from file with a semi-transparent black box background
        '-vf', `drawtext=textfile='${safeTextPath}':fontcolor=white:fontsize=36:box=1:boxcolor=black@0.6:boxborderw=10:x=(w-text_w)/2:y=h-text_h-50:line_spacing=10`
      ])
      .save(outputPath)
      .on('end', () => resolve())
      .on('error', (err: any) => reject(err));
  });
}

// Helper to concatenate segments with faststart for web streaming
function concatenateSegments(segmentPaths: string[], outputPath: string, tmpDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const concatPath = path.join(tmpDir, 'concat.txt');
    // FFmpeg concat demuxer needs forward slashes for absolute paths on Windows
    const concatContent = segmentPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(concatPath, concatContent, 'utf8');

    ffmpeg()
      .input(concatPath)
      .inputOptions(['-f', 'concat', '-safe', '0'])
      .outputOptions([
        '-c', 'copy',
        '-movflags', '+faststart'
      ])
      .save(outputPath)
      .on('end', () => resolve())
      .on('error', (err: any) => reject(err));
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
    const downloadedImages = new Map<string, string>();
    
    let lastImageURL = scenes[0].image_url;
    if (!lastImageURL) {
      const firstAvailable = scenes.find(s => s.image_url);
      if (firstAvailable) {
        lastImageURL = firstAvailable.image_url;
      }
    }

    // Build segments
    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      if (scene.image_url) lastImageURL = scene.image_url;
      if (!lastImageURL) throw new Error(`Missing image for scene ${scene.scene_number}`);

      let imgPath = downloadedImages.get(lastImageURL);
      if (!imgPath) {
        imgPath = path.join(tmpDir, `image_${i}.jpg`);
        console.log(`Downloading image for scene ${scene.scene_number}...`);
        await downloadFile(lastImageURL, imgPath);
        downloadedImages.set(lastImageURL, imgPath);
      }

      const audioPath = path.join(tmpDir, `audio_${i}.mp3`);
      const outPath = path.join(tmpDir, `segment_${i}.mp4`);

      console.log(`Downloading audio for scene ${scene.scene_number}...`);
      await downloadFile(scene.audio_url, audioPath);

      console.log(`Rendering segment ${scene.scene_number}...`);
      await createSegment(imgPath, audioPath, scene.script, outPath, tmpDir, i);
      segmentPaths.push(outPath);
    }

    const finalVideoPath = path.join(tmpDir, `final_${storyId}.mp4`);
    console.log(`Concatenating ${segmentPaths.length} segments...`);
    await concatenateSegments(segmentPaths, finalVideoPath, tmpDir);

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
