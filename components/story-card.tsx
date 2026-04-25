'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader as Loader2, CircleAlert as AlertCircle, CircleCheck as CheckCircle, Trash2, Youtube, BookOpen, Download, ChevronDown, ChevronUp } from 'lucide-react';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/hooks/use-toast';

type Scene = {
  id: string;
  scene_number: number;
  script: string;
  image_prompt: string;
  image_url: string | null;
  image_status: string;
  audio_url?: string | null;
};

type Story = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  video_url?: string | null;
  youtube_url?: string | null;
  scenes: Scene[];
};

interface StoryCardProps {
  story: Story;
  onRefresh: () => void;
  viewMode?: 'card' | 'list';
}

export function StoryCard({ story, onRefresh, viewMode = 'card' }: StoryCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isUploadingYouTube, setIsUploadingYouTube] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [autoUpload, setAutoUpload] = useState(false);
  const [youtubeMainConnected, setYoutubeMainConnected] = useState(false);
  const [youtubeSubConnected, setYoutubeSubConnected] = useState(false);
  const [uploadChannel, setUploadChannel] = useState<'main' | 'sub'>('main');
  const [isExpanded, setIsExpanded] = useState(viewMode === 'card');
  const supabase = createClient();
  const { toast } = useToast();

  useEffect(() => {
    setIsExpanded(viewMode === 'card');
  }, [viewMode]);

  useEffect(() => {
    // Check if user has YouTube connected so we can show the switch
    const checkYt = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('user_settings').select('youtube_refresh_token, youtube_sub_refresh_token').eq('user_id', user.id).single();
      if (data) {
        if (data.youtube_refresh_token) setYoutubeMainConnected(true);
        if (data.youtube_sub_refresh_token) setYoutubeSubConnected(true);
        
        // If main is not connected but sub is, default to sub
        if (!data.youtube_refresh_token && data.youtube_sub_refresh_token) {
          setUploadChannel('sub');
        }
      }
    };
    checkYt();
  }, [supabase]);

  const handleGenerateVideo = async () => {
    try {
      setIsGeneratingVideo(true);
      toast({ title: 'Generating Audio', description: 'Generating narration for scenes...' });
      
      const audioResponse = await fetch('/api/generate-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: story.id }),
      });
      if (!audioResponse.ok) {
        const err = await audioResponse.json();
        throw new Error(err.error || 'Failed to generate audio');
      }

      toast({ title: 'Compiling Video', description: 'Merging images and audio. This may take a minute...' });
      
      // Update local status so UI shows it's compiling
      onRefresh();

      const videoResponse = await fetch('/api/compile-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: story.id }),
      });
      if (!videoResponse.ok) {
        const err = await videoResponse.json();
        throw new Error(err.error || 'Failed to compile video');
      }

      toast({ title: 'Success', description: 'Video generated successfully!' });
      onRefresh();

      // YouTube Auto-Upload
      if (autoUpload) {
        setIsUploadingYouTube(true);
        toast({ title: 'YouTube Upload', description: `Uploading video to YouTube ${uploadChannel} channel as private...` });
        
        const ytResponse = await fetch('/api/youtube/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: story.id, channelType: uploadChannel })
        });
        
        if (!ytResponse.ok) {
          const err = await ytResponse.json();
          throw new Error(err.error || 'Failed to upload to YouTube');
        }
        
        toast({ title: 'Success', description: 'Video automatically uploaded to YouTube!' });
        onRefresh();
      }

    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to process', variant: 'destructive' });
    } finally {
      setIsGeneratingVideo(false);
      setIsUploadingYouTube(false);
    }
  };

  const handleUploadYouTube = async () => {
    try {
      setIsUploadingYouTube(true);
      toast({ title: 'YouTube Upload', description: `Uploading video to YouTube ${uploadChannel} channel as private...` });
      
      const ytResponse = await fetch('/api/youtube/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: story.id, channelType: uploadChannel })
      });
      
      if (!ytResponse.ok) {
        const err = await ytResponse.json();
        throw new Error(err.error || 'Failed to upload to YouTube');
      }
      
      toast({ title: 'Success', description: 'Video uploaded to YouTube!' });
      onRefresh();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to upload to YouTube', variant: 'destructive' });
    } finally {
      setIsUploadingYouTube(false);
    }
  };

  const handleDownload = async () => {
    if (!story.video_url) return;
    try {
      setIsDownloading(true);
      setDownloadProgress(0);
      toast({ title: 'Downloading', description: 'Preparing your video download...' });
      
      const response = await fetch(story.video_url);
      if (!response.ok) throw new Error('Failed to fetch video');

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      // Feature detect File System Access API
      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: `${story.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4`,
            types: [{
              description: 'Video File',
              accept: { 'video/mp4': ['.mp4'] },
            }],
          });
          
          const writable = await handle.createWritable();
          const reader = response.body!.getReader();
          let loaded = 0;
          
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            loaded += value.length;
            if (total) {
              setDownloadProgress(Math.round((loaded / total) * 100));
            }
            await writable.write(value);
          }
          
          await writable.close();
          toast({ title: 'Success', description: 'Video saved successfully!' });
          return;
        } catch (err: any) {
          // If user cancels the picker, just abort
          if (err.name === 'AbortError') return;
          console.error("SaveFilePicker failed, falling back to traditional download:", err);
        }
      }

      // Fallback if showSaveFilePicker is not supported or failed
      const reader = response.body!.getReader();
      const chunks = [];
      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        if (total) {
          setDownloadProgress(Math.round((loaded / total) * 100));
        }
      }
      
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${story.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({ title: 'Success', description: 'Video download complete!' });
    } catch (error: any) {
      window.open(story.video_url, '_blank');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const handleRetryImages = async () => {
    try {
      setIsRetrying(true);
      toast({
        title: 'Started Image Generation',
        description: 'Image generation is running...',
      });
      
      let hasMore = true;
      let errorCount = 0;
      let isFirstTry = true;
      
      while (hasMore && errorCount < 3) {
        try {
          const response = await fetch('/api/generate-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storyId: story.id, retryFailed: isFirstTry }),
          });
          
          isFirstTry = false;
          
          if (!response.ok) {
            throw new Error(`Failed to generate image: ${response.status}`);
          }
          
          const data = await response.json();
          onRefresh(); // Refresh UI to show the new image or status
          hasMore = data.morePending;
          errorCount = 0; // reset on success
        } catch (err) {
          console.error('Image generation error:', err);
          errorCount++;
          if (errorCount >= 3) throw err;
          // Wait a bit before retrying
          await new Promise(r => setTimeout(r, 2000));
        }
      }
      
      if (!hasMore) {
        toast({
          title: 'Completed',
          description: 'All images generated successfully.',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to retry image generation',
        variant: 'destructive',
      });
    } finally {
      setIsRetrying(false);
    }
  };

  const handleContinueSeries = async () => {
    try {
      setIsContinuing(true);
      toast({ title: 'Continuing Story', description: 'Generating the next part of the series...' });

      // Determine new title (e.g., "Story Title (Part 2)")
      let newTitle = story.title;
      const partMatch = story.title.match(/(.*) \(Part (\d+)\)$/);
      if (partMatch) {
        const nextPart = parseInt(partMatch[2], 10) + 1;
        newTitle = `${partMatch[1]} (Part ${nextPart})`;
      } else {
        newTitle = `${story.title} (Part 2)`;
      }

      // Gather context
      const lastScenes = story.scenes.slice(-4).map(s => s.script).join('\n\n');
      const continuationIdea = `This is a continuation of the previous part. Continue the narrative seamlessly. Here is the end of the previous part for context:\n\n${lastScenes}`;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: newStory, error: storyError } = await supabase
        .from('stories')
        .insert({
          user_id: user.id,
          title: newTitle,
          status: 'generating',
        })
        .select()
        .single();

      if (storyError) throw storyError;

      const response = await fetch('/api/generate-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyIdea: continuationIdea, storyId: newStory.id, storyLength: 40 }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate continuation');
      }

      toast({
        title: 'Success',
        description: 'Story text generated! Now generating images...',
      });

      onRefresh();

      // Trigger image generation robustly
      let hasMore = true;
      let errorCount = 0;
      
      while (hasMore && errorCount < 3) {
        try {
          const res = await fetch('/api/generate-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ storyId: newStory.id }),
          });
          if (!res.ok) throw new Error('Failed to generate image');
          
          const data = await res.json();
          onRefresh();
          hasMore = data.morePending;
          errorCount = 0; // reset on success
        } catch (err) {
          console.error('Failed to trigger image generation:', err);
          errorCount++;
          if (errorCount < 3) {
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      }

    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to continue story',
        variant: 'destructive',
      });
    } finally {
      setIsContinuing(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      const { error } = await supabase.from('stories').delete().eq('id', story.id);
      if (error) throw error;
      
      toast({
        title: 'Story deleted',
        description: 'The story has been removed from your dashboard.',
      });
      onRefresh();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete story',
        variant: 'destructive',
      });
      setIsDeleting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle className="mr-1 h-3 w-3" />
            Completed
          </Badge>
        );
      case 'generating':
        return (
          <Badge variant="default" className="bg-blue-500">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Generating Text & Images
          </Badge>
        );
      case 'compiling_video':
        return (
          <Badge variant="default" className="bg-purple-500">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Compiling Video
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive">
            <AlertCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const hasStuckScenes = story.scenes.some(s => s.image_status === 'pending' || s.image_status === 'failed');
  const isGeneratingImages = story.scenes.some(s => s.image_status === 'generating');
  const allImagesDone = story.scenes.length > 0 && story.scenes.every(s => s.image_status === 'completed' || s.image_status === 'skipped');
  const canGenerateVideo = allImagesDone && !story.video_url && story.status !== 'compiling_video';
  const isStuckCompiling = allImagesDone && !story.video_url && story.status === 'compiling_video';
  const canRegenerateVideo = allImagesDone && !!story.video_url && story.status !== 'compiling_video';
  
  const canContinueSeries = story.scenes.length === 40 && allImagesDone && story.status !== 'compiling_video';

  const totalWords = story.scenes.reduce((acc, scene) => acc + (scene.script ? scene.script.split(/\s+/).length : 0), 0);

  return (
    <Card className="shadow-lg overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-xl flex items-center gap-2 cursor-pointer hover:text-primary transition-colors" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
              {story.title}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Created {new Date(story.created_at).toLocaleDateString()} at{' '}
              {new Date(story.created_at).toLocaleTimeString()}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {getStatusBadge(story.status)}
            {isExpanded && (
              <div className="flex items-center gap-3 flex-wrap justify-end mt-2 sm:mt-0">
              {(youtubeMainConnected || youtubeSubConnected) && (
                <div className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-900 px-3 py-1.5 rounded-md border">
                  <Select value={uploadChannel} onValueChange={(val: 'main' | 'sub') => setUploadChannel(val)}>
                    <SelectTrigger className="w-32 h-8 text-xs border-none bg-transparent shadow-none focus:ring-0">
                      <SelectValue placeholder="Channel" />
                    </SelectTrigger>
                    <SelectContent>
                      {youtubeMainConnected && <SelectItem value="main">Main Channel</SelectItem>}
                      {youtubeSubConnected && <SelectItem value="sub">Sub Channel</SelectItem>}
                    </SelectContent>
                  </Select>
                  <Switch 
                    id={`yt-upload-${story.id}`} 
                    checked={autoUpload} 
                    onCheckedChange={setAutoUpload}
                    disabled={isGeneratingVideo || isUploadingYouTube}
                  />
                  <Label htmlFor={`yt-upload-${story.id}`} className="text-sm cursor-pointer flex items-center gap-1">
                    <Youtube className="w-4 h-4 text-red-500" />
                    Auto-Upload
                  </Label>
                </div>
              )}
              {canGenerateVideo && (
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={handleGenerateVideo} 
                  disabled={isGeneratingVideo || isUploadingYouTube}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {(isGeneratingVideo || isUploadingYouTube) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <AlertCircle className="h-4 w-4 mr-1 hidden" />}
                  {isUploadingYouTube ? 'Uploading to YouTube...' : 'Generate Video'}
                </Button>
              )}
              {canRegenerateVideo && (
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={handleGenerateVideo} 
                  disabled={isGeneratingVideo || isUploadingYouTube}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {(isGeneratingVideo || isUploadingYouTube) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <AlertCircle className="h-4 w-4 mr-1 hidden" />}
                  {isGeneratingVideo ? 'Recompiling...' : 'Regenerate Video'}
                </Button>
              )}
              {canContinueSeries && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleContinueSeries} 
                  disabled={isContinuing || isGeneratingVideo}
                  className="bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-200 dark:bg-blue-950/30 dark:hover:bg-blue-900/50 dark:border-blue-900/50"
                >
                  {isContinuing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <BookOpen className="h-4 w-4 mr-1" />}
                  {isContinuing ? 'Continuing...' : 'Continue Series'}
                </Button>
              )}
              {story.video_url && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleDownload} 
                  disabled={isDownloading}
                  className="bg-green-50 hover:bg-green-100 text-green-600 border-green-200 dark:bg-green-950/30 dark:hover:bg-green-900/50 dark:border-green-900/50"
                >
                  {isDownloading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
                  {isDownloading ? (downloadProgress > 0 ? `Downloading ${downloadProgress}%` : 'Starting...') : 'Download Video'}
                </Button>
              )}
              {story.video_url && !story.youtube_url && (youtubeMainConnected || youtubeSubConnected) && (
                <div className="flex items-center gap-2">
                  <Select value={uploadChannel} onValueChange={(val: 'main' | 'sub') => setUploadChannel(val)}>
                    <SelectTrigger className="w-32 h-9 text-xs">
                      <SelectValue placeholder="Channel" />
                    </SelectTrigger>
                    <SelectContent>
                      {youtubeMainConnected && <SelectItem value="main">Main Channel</SelectItem>}
                      {youtubeSubConnected && <SelectItem value="sub">Sub Channel</SelectItem>}
                    </SelectContent>
                  </Select>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleUploadYouTube} 
                    disabled={isUploadingYouTube}
                    className="bg-red-50 hover:bg-red-100 text-red-600 border-red-200 dark:bg-red-950/30 dark:hover:bg-red-900/50 dark:border-red-900/50"
                  >
                    {isUploadingYouTube ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Youtube className="h-4 w-4 mr-1" />}
                    {isUploadingYouTube ? 'Uploading...' : 'Upload to YouTube'}
                  </Button>
                </div>
              )}
              {hasStuckScenes && !isGeneratingImages && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleRetryImages} 
                  disabled={isRetrying}
                >
                  {isRetrying ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <AlertCircle className="h-4 w-4 mr-1" />}
                  Retry Images
                </Button>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDelete} 
                disabled={isDeleting}
                className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50"
              >
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                {story.status === 'failed' || story.status === 'generating' || story.scenes.some(s => s.image_status === 'failed' || s.image_status === 'generating') ? 'Cancel & Delete' : 'Delete'}
              </Button>
            </div>
            )}
          </div>
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="p-6">
          {story.video_url && (
          <div className="mb-8 p-4 bg-slate-900 rounded-xl shadow-inner">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
              <h3 className="text-white text-lg font-semibold flex items-center gap-2">
                <span className="text-purple-400">🎬</span> Final Generated Video
              </h3>
              {story.youtube_url && (
                <a href={story.youtube_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-medium text-red-400 hover:text-red-300 bg-red-950/30 px-3 py-1.5 rounded-lg border border-red-900/50 transition-colors">
                  <Youtube className="w-4 h-4" />
                  View on YouTube (Private)
                </a>
              )}
            </div>
            <video 
              src={story.video_url} 
              controls 
              className="w-full aspect-video rounded-lg shadow-lg bg-black"
            />
          </div>
        )}

        {story.scenes.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
            <p>Generating scenes...</p>
          </div>
        ) : (
          <div className="space-y-8">
            {story.scenes.map((scene) => (
              <div key={scene.id} className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-sm">
                    Scene {scene.scene_number}
                  </Badge>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-4 border">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{scene.script}</p>
                </div>

                {scene.image_url ? (
                  <div className="relative w-full aspect-video rounded-lg overflow-hidden border shadow-sm">
                    <Image
                      src={scene.image_url}
                      alt={`Scene ${scene.scene_number}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    />
                  </div>
                ) : scene.image_status === 'generating' ? (
                  <div className="w-full aspect-video rounded-lg border bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                    <div className="text-center">
                      <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-primary" />
                      <p className="text-sm text-muted-foreground">Generating image...</p>
                    </div>
                  </div>
                ) : scene.image_status === 'failed' ? (
                  <div className="w-full aspect-video rounded-lg border bg-red-50 dark:bg-red-900/10 flex items-center justify-center">
                    <div className="text-center">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-500" />
                      <p className="text-sm text-red-600 dark:text-red-400">Image generation failed</p>
                    </div>
                  </div>
                ) : scene.image_status === 'skipped' ? null : (
                  <div className="w-full aspect-video rounded-lg border bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">Waiting to generate image...</p>
                  </div>
                )}


              </div>
            ))}
          </div>
        )}
      </CardContent>
      )}
    </Card>
  );
}
