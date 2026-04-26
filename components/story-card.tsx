'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader as Loader2, CircleAlert as AlertCircle, CircleCheck as CheckCircle, Trash2, Youtube, BookOpen, Download, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
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
    <Card className="shadow-lg overflow-hidden transition-all duration-200">
      <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-slate-100/80 dark:from-slate-900/80 dark:to-slate-900">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1.5 flex-1 min-w-0 w-full">
            <CardTitle 
              className="text-xl flex items-center gap-2 cursor-pointer hover:text-primary transition-colors select-none" 
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <div className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors shrink-0">
                {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
              </div>
              <span className="truncate">{story.title}</span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground pl-9">
              <span className="whitespace-nowrap">{new Date(story.created_at).toLocaleDateString()}</span>
              <span className="hidden sm:inline">•</span>
              <span className="whitespace-nowrap">{totalWords} words</span>
              <span className="hidden sm:inline">•</span>
              <span className="whitespace-nowrap">{story.scenes.length} scenes</span>
            </div>
          </div>
          <div className="flex items-center pl-9 sm:pl-0 shrink-0">
            {getStatusBadge(story.status)}
          </div>
        </div>

        {isExpanded && (
          <div className="flex flex-wrap items-center gap-3 pt-4 mt-4 border-t border-slate-200 dark:border-slate-800">
            {(youtubeMainConnected || youtubeSubConnected) && (
              <div className="flex items-center space-x-2 bg-white dark:bg-slate-950 px-3 py-1.5 rounded-md border shadow-sm">
                <Select value={uploadChannel} onValueChange={(val: 'main' | 'sub') => setUploadChannel(val)}>
                  <SelectTrigger className="w-28 h-8 text-xs border-none bg-transparent shadow-none focus:ring-0 px-1">
                    <SelectValue placeholder="Channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {youtubeMainConnected && <SelectItem value="main">Main Channel</SelectItem>}
                    {youtubeSubConnected && <SelectItem value="sub">Sub Channel</SelectItem>}
                  </SelectContent>
                </Select>
                <div className="w-px h-4 bg-slate-200 dark:bg-slate-800" />
                <Switch 
                  id={`yt-upload-${story.id}`} 
                  checked={autoUpload} 
                  onCheckedChange={setAutoUpload}
                  disabled={isGeneratingVideo || isUploadingYouTube}
                  className="scale-75 data-[state=checked]:bg-red-500"
                />
                <Label htmlFor={`yt-upload-${story.id}`} className="text-xs font-medium cursor-pointer flex items-center gap-1 select-none pr-1">
                  <Youtube className="w-3.5 h-3.5 text-red-500" />
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
                className="bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-colors"
              >
                {(isGeneratingVideo || isUploadingYouTube) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <AlertCircle className="h-4 w-4 mr-2 hidden" />}
                {isUploadingYouTube ? 'Uploading to YouTube...' : 'Generate Video'}
              </Button>
            )}
            {canRegenerateVideo && (
              <Button 
                variant="default" 
                size="sm" 
                onClick={handleGenerateVideo} 
                disabled={isGeneratingVideo || isUploadingYouTube}
                className="bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition-colors"
              >
                {(isGeneratingVideo || isUploadingYouTube) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <AlertCircle className="h-4 w-4 mr-2 hidden" />}
                {isGeneratingVideo ? 'Recompiling...' : 'Regenerate Video'}
              </Button>
            )}
            {canContinueSeries && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleContinueSeries} 
                disabled={isContinuing || isGeneratingVideo}
                className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/30 dark:hover:bg-blue-900/50 dark:border-blue-900/50 shadow-sm transition-colors"
              >
                {isContinuing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BookOpen className="h-4 w-4 mr-2" />}
                {isContinuing ? 'Continuing...' : 'Continue Series'}
              </Button>
            )}
            {story.video_url && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDownload} 
                disabled={isDownloading}
                className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200 dark:bg-green-950/30 dark:hover:bg-green-900/50 dark:border-green-900/50 shadow-sm transition-colors"
              >
                {isDownloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                {isDownloading ? (downloadProgress > 0 ? `Downloading ${downloadProgress}%` : 'Starting...') : 'Download Video'}
              </Button>
            )}
            {story.video_url && !story.youtube_url && (youtubeMainConnected || youtubeSubConnected) && (
              <div className="flex items-center gap-2 bg-white dark:bg-slate-950 p-1 rounded-md border shadow-sm">
                <Select value={uploadChannel} onValueChange={(val: 'main' | 'sub') => setUploadChannel(val)}>
                  <SelectTrigger className="w-28 h-7 text-xs border-none shadow-none focus:ring-0">
                    <SelectValue placeholder="Channel" />
                  </SelectTrigger>
                  <SelectContent>
                    {youtubeMainConnected && <SelectItem value="main">Main Channel</SelectItem>}
                    {youtubeSubConnected && <SelectItem value="sub">Sub Channel</SelectItem>}
                  </SelectContent>
                </Select>
                <div className="w-px h-4 bg-slate-200 dark:bg-slate-800" />
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={handleUploadYouTube} 
                  disabled={isUploadingYouTube}
                  className="h-7 text-xs text-red-700 hover:text-red-800 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                >
                  {isUploadingYouTube ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Youtube className="h-3 w-3 mr-1.5" />}
                  {isUploadingYouTube ? 'Uploading...' : 'Upload'}
                </Button>
              </div>
            )}
            {hasStuckScenes && !isGeneratingImages && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRetryImages} 
                disabled={isRetrying}
                className="bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/30 dark:hover:bg-amber-900/50 dark:border-amber-900/50 shadow-sm transition-colors"
              >
                {isRetrying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                {isRetrying ? 'Retrying...' : 'Retry Images'}
              </Button>
            )}
            <div className="flex-1" />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleDelete} 
              disabled={isDeleting}
              className="bg-red-50 hover:bg-red-100 text-red-700 border-red-200 dark:bg-red-950/30 dark:hover:bg-red-900/50 dark:border-red-900/50 shadow-sm transition-colors ml-auto"
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
              {story.status === 'failed' || story.status === 'generating' || story.scenes.some(s => s.image_status === 'failed' || s.image_status === 'generating') ? 'Cancel & Delete' : 'Delete'}
            </Button>
          </div>
        )}
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="p-6 bg-slate-50/50 dark:bg-slate-900/20">
          {story.video_url && (
            <div className="mb-8 p-5 bg-slate-950 rounded-xl shadow-inner border border-slate-800">
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
                className="w-full aspect-video rounded-lg shadow-lg bg-black ring-1 ring-white/10"
              />
            </div>
          )}

          {story.scenes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 bg-white dark:bg-slate-950 rounded-xl border border-dashed border-slate-300 dark:border-slate-800">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
              <p className="text-lg font-medium text-slate-700 dark:text-slate-300">Generating your storyboard</p>
              <p className="text-sm text-muted-foreground mt-1 text-center max-w-sm">
                The AI is crafting your scenes, writing the script, and preparing the image prompts. This usually takes a minute.
              </p>
            </div>
          ) : (
            <div className={viewMode === 'card' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" : "space-y-6"}>
              {story.scenes.map((scene) => (
                <div key={scene.id} className={`flex ${viewMode === 'card' ? 'flex-col' : 'flex-col sm:flex-row'} bg-white dark:bg-slate-950 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all duration-200`}>
                  
                  {/* Image Section */}
                  <div className={`relative ${viewMode === 'card' ? 'w-full aspect-video border-b' : 'w-full sm:w-64 md:w-80 shrink-0 border-b sm:border-b-0 sm:border-r'} border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 flex items-center justify-center overflow-hidden group`}>
                    <div className="absolute top-3 left-3 z-10">
                      <Badge variant="secondary" className="bg-white/90 dark:bg-slate-950/90 text-slate-900 dark:text-slate-100 backdrop-blur-md shadow-sm font-semibold border-none">
                        Scene {scene.scene_number}
                      </Badge>
                    </div>
                    
                    {scene.image_url ? (
                      <Image
                        src={scene.image_url}
                        alt={`Scene ${scene.scene_number}`}
                        fill
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      />
                    ) : scene.image_status === 'generating' ? (
                      <div className="flex flex-col items-center justify-center p-6 text-center w-full h-full min-h-[200px]">
                        <Loader2 className="h-8 w-8 animate-spin mb-3 text-primary/70" />
                        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Painting image...</p>
                      </div>
                    ) : scene.image_status === 'failed' ? (
                      <div className="flex flex-col items-center justify-center p-6 text-center w-full h-full min-h-[200px] bg-red-50/50 dark:bg-red-950/20">
                        <AlertCircle className="h-8 w-8 mb-3 text-red-500/70" />
                        <p className="text-xs font-medium text-red-600 dark:text-red-400">Generation failed</p>
                      </div>
                    ) : scene.image_status === 'skipped' ? (
                      <div className="flex flex-col items-center justify-center p-6 text-center w-full h-full min-h-[200px] bg-slate-100/50 dark:bg-slate-800/50">
                        <div className="w-12 h-12 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center mb-3">
                          <span className="text-xl opacity-50 grayscale">⏭️</span>
                        </div>
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-500">Skipped</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-6 text-center w-full h-full min-h-[200px]">
                        <div className="w-8 h-8 rounded-full border-2 border-slate-300 dark:border-slate-700 border-t-transparent animate-spin mb-3"></div>
                        <p className="text-xs font-medium text-slate-500">Pending in queue...</p>
                      </div>
                    )}
                  </div>

                  {/* Script Section */}
                  <div className={`flex flex-col flex-1 p-5 ${viewMode === 'card' ? 'h-48' : ''}`}>
                    <div className={`flex-1 overflow-y-auto pr-2 ${viewMode === 'card' ? 'text-sm' : 'text-base sm:text-sm md:text-base'} text-slate-700 dark:text-slate-300 leading-relaxed space-y-3`}>
                      {scene.script.split('\n').map((paragraph, idx) => (
                        paragraph.trim() ? <p key={idx}>{paragraph}</p> : null
                      ))}
                    </div>
                  </div>

                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
