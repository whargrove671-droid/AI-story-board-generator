'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader as Loader2, CircleAlert as AlertCircle, CircleCheck as CheckCircle, Trash2, Youtube, BookOpen, Download, ChevronDown, ChevronUp, RefreshCw, Edit2, Check, X, Copy } from 'lucide-react';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  const [downloadCompleted, setDownloadCompleted] = useState(false);
  const [autoUpload, setAutoUpload] = useState(false);
  const [youtubeMainConnected, setYoutubeMainConnected] = useState(false);
  const [youtubeSubConnected, setYoutubeSubConnected] = useState(false);
  const [uploadChannel, setUploadChannel] = useState<'main' | 'sub'>('main');
  const [isExpanded, setIsExpanded] = useState(viewMode === 'card');
  const [regeneratingScenes, setRegeneratingScenes] = useState<Set<string>>(new Set());
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [editedScript, setEditedScript] = useState<string>('');
  const [isSavingScript, setIsSavingScript] = useState(false);
  const [editingPromptSceneId, setEditingPromptSceneId] = useState<string | null>(null);
  const [editedPrompt, setEditedPrompt] = useState<string>('');
  const [isSavingPrompt, setIsSavingPrompt] = useState(false);
  const [hasCopiedPrompt, setHasCopiedPrompt] = useState(false);
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
    let downloadSucceeded = false;
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
          downloadSucceeded = true;
        } catch (err: any) {
          // If user cancels the picker, just abort
          if (err.name === 'AbortError') {
            return; // Exit early, finally will still run to clean up state.
          }
          console.error("SaveFilePicker failed, falling back to traditional download:", err);
          // Re-throw to be caught by the outer catch which has fallback logic
          throw err;
        }
      } else {
        // Fallback for browsers without showSaveFilePicker
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
        downloadSucceeded = true;
      }
    } catch (error: any) {
      toast({ title: 'Download Failed', description: 'Opening video in a new tab as a fallback.', variant: 'destructive' });
      window.open(story.video_url, '_blank');
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
      if (downloadSucceeded) {
        setDownloadCompleted(true);
        setTimeout(() => setDownloadCompleted(false), 2500);
      }
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

  const handleRegenerateImage = async (sceneId: string) => {
    try {
      setRegeneratingScenes(prev => {
        const next = new Set(prev);
        next.add(sceneId);
        return next;
      });
      toast({ title: 'SYS_REGEN', description: 'INITIATING NEURAL RE-RENDER...' });
      
      const response = await fetch('/api/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: story.id, sceneId }),
      });
      
      if (!response.ok) throw new Error('FAILED TO COMMUNICATE WITH RENDER NODE');
      
      toast({ title: 'SYS_SUCCESS', description: 'SCENE RE-RENDER QUEUED.' });
      onRefresh();
    } catch (error: any) {
      toast({ title: 'ERR_FAILED', description: error.message || 'Render failed', variant: 'destructive' });
    } finally {
      setRegeneratingScenes(prev => {
        const next = new Set(prev);
        next.delete(sceneId);
        return next;
      });
    }
  };

  const handleEditPrompt = (scene: Scene) => {
    setEditingPromptSceneId(scene.id);
    setEditedPrompt(scene.image_prompt);
  };

  const handleCancelEditPrompt = () => {
    setEditingPromptSceneId(null);
    setEditedPrompt('');
  };

  const handleSavePrompt = async (sceneId: string) => {
    try {
      setIsSavingPrompt(true);
      const { error } = await supabase.from('scenes').update({ image_prompt: editedPrompt }).eq('id', sceneId);
      if (error) throw error;
      
      toast({ title: 'SYS_SUCCESS', description: 'IMAGE PROMPT UPDATED.' });
      setEditingPromptSceneId(null);
      onRefresh();
    } catch (error: any) {
      toast({ title: 'ERR_FAILED', description: error.message || 'Failed to update prompt', variant: 'destructive' });
    } finally {
      setIsSavingPrompt(false);
    }
  };

  const handleEditScript = (scene: Scene) => {
    setEditingSceneId(scene.id);
    setEditedScript(scene.script);
  };

  const handleCancelEdit = () => {
    setEditingSceneId(null);
    setEditedScript('');
  };

  const handleSaveScript = async (sceneId: string) => {
    try {
      setIsSavingScript(true);
      const { error } = await supabase.from('scenes').update({ script: editedScript }).eq('id', sceneId);
      if (error) throw error;
      
      toast({ title: 'SYS_SUCCESS', description: 'SCRIPT UPDATED.' });
      setEditingSceneId(null);
      onRefresh();
    } catch (error: any) {
      toast({ title: 'ERR_FAILED', description: error.message || 'Failed to update script', variant: 'destructive' });
    } finally {
      setIsSavingScript(false);
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
          <Badge variant="default" className="bg-cyan-500/20 text-cyan-400 border border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.3)] font-mono uppercase rounded-none">
            <CheckCircle className="mr-2 h-3 w-3" />
            SYS.COMPLETED
          </Badge>
        );
      case 'generating':
        return (
          <Badge variant="default" className="bg-fuchsia-500/20 text-fuchsia-400 border border-fuchsia-500 shadow-[0_0_10px_rgba(192,38,211,0.3)] font-mono uppercase rounded-none animate-pulse">
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            GENERATING_ASSETS
          </Badge>
        );
      case 'compiling_video':
        return (
          <Badge variant="default" className="bg-purple-500/20 text-purple-400 border border-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.3)] font-mono uppercase rounded-none animate-pulse">
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            COMPILING_VIDEO
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="bg-red-500/20 text-red-400 border border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)] font-mono uppercase rounded-none">
            <AlertCircle className="mr-2 h-3 w-3" />
            ERR_FAILED
          </Badge>
        );
      default:
        return <Badge variant="secondary" className="bg-zinc-900 text-zinc-400 border border-zinc-700 font-mono uppercase rounded-none">{status}</Badge>;
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
    <Card className="bg-black border border-cyan-900/50 shadow-[0_0_20px_rgba(6,182,212,0.1)] hover:shadow-[0_0_30px_rgba(6,182,212,0.2)] overflow-hidden transition-all duration-300 rounded-sm">
      <CardHeader className="border-b border-cyan-900/50 bg-gradient-to-r from-black via-zinc-950 to-black">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1.5 flex-1 min-w-0 w-full">
            <CardTitle 
              className="text-xl flex items-center gap-2 cursor-pointer text-cyan-400 hover:text-cyan-300 transition-colors select-none font-mono uppercase tracking-wider drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]" 
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <div className="p-1 border border-cyan-900/50 bg-black hover:bg-cyan-950/50 transition-colors shrink-0 rounded-none">
                {isExpanded ? <ChevronUp className="w-5 h-5 text-cyan-500" /> : <ChevronDown className="w-5 h-5 text-cyan-500" />}
              </div>
              <span className="truncate">{story.title}</span>
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 text-xs text-cyan-700 font-mono pl-9">
              <span className="whitespace-nowrap">{new Date(story.created_at).toLocaleDateString()}</span>
              <span className="hidden sm:inline text-cyan-900">|</span>
              <span className="whitespace-nowrap">{totalWords} WORDS</span>
              <span className="hidden sm:inline text-cyan-900">|</span>
              <span className="whitespace-nowrap">{story.scenes.length} SCENES</span>
            </div>
          </div>
          <div className="flex items-center pl-9 sm:pl-0 shrink-0">
            {getStatusBadge(story.status)}
          </div>
        </div>

        {isExpanded && (
          <TooltipProvider delayDuration={300}>
            <div className="flex flex-wrap items-center gap-3 pt-4 mt-4 border-t border-cyan-900/50">
              {(youtubeMainConnected || youtubeSubConnected) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center space-x-2 bg-black px-3 py-1.5 border border-cyan-900/50 shadow-[0_0_10px_rgba(6,182,212,0.1)] rounded-none">
                      <Select value={uploadChannel} onValueChange={(val: 'main' | 'sub') => setUploadChannel(val)}>
                        <SelectTrigger className="w-28 h-8 text-xs border-none bg-transparent shadow-none focus:ring-0 px-1 text-cyan-400 font-mono">
                          <SelectValue placeholder="Channel" />
                        </SelectTrigger>
                        <SelectContent className="bg-black border-cyan-900 text-cyan-400 font-mono rounded-none">
                          {youtubeMainConnected && <SelectItem value="main">Main Channel</SelectItem>}
                          {youtubeSubConnected && <SelectItem value="sub">Sub Channel</SelectItem>}
                        </SelectContent>
                      </Select>
                      <div className="w-px h-4 bg-cyan-900/50" />
                      <Switch 
                        id={`yt-upload-${story.id}`} 
                        checked={autoUpload} 
                        onCheckedChange={setAutoUpload}
                        disabled={isGeneratingVideo || isUploadingYouTube}
                        className="scale-75 data-[state=checked]:bg-fuchsia-600 data-[state=unchecked]:bg-zinc-800 border-cyan-900"
                      />
                      <Label htmlFor={`yt-upload-${story.id}`} className="text-xs font-mono text-cyan-400 cursor-pointer flex items-center gap-1 select-none pr-1 uppercase">
                        <Youtube className="w-3.5 h-3.5 text-red-500" />
                        AUTO-UPLINK
                      </Label>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="bg-black border border-cyan-500 text-cyan-400 font-mono text-xs rounded-none shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                    <p>Automatically upload to YouTube when generation completes</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {canGenerateVideo && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-block">
                      <Button 
                        variant="default" 
                        size="sm" 
                        onClick={handleGenerateVideo} 
                        disabled={isGeneratingVideo || isUploadingYouTube}
                        className={`bg-fuchsia-600/20 hover:bg-fuchsia-600/40 text-fuchsia-400 border border-fuchsia-500 shadow-[0_0_10px_rgba(192,38,211,0.3)] hover:shadow-[0_0_15px_rgba(192,38,211,0.5)] transition-all font-mono uppercase rounded-none ${!(isGeneratingVideo || isUploadingYouTube) ? 'animate-pulse hover:animate-none' : ''}`}
                      >
                        {(isGeneratingVideo || isUploadingYouTube) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <AlertCircle className="h-4 w-4 mr-2 hidden" />}
                        {isUploadingYouTube ? 'UPLOADING...' : 'GENERATE_VIDEO'}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="bg-black border border-cyan-500 text-cyan-400 font-mono text-xs rounded-none shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                    <p>Compile generated scenes into a final video</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {canRegenerateVideo && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-block">
                      <Button 
                        variant="default" 
                        size="sm" 
                        onClick={handleGenerateVideo} 
                        disabled={isGeneratingVideo || isUploadingYouTube}
                        className={`bg-fuchsia-600/20 hover:bg-fuchsia-600/40 text-fuchsia-400 border border-fuchsia-500 shadow-[0_0_10px_rgba(192,38,211,0.3)] hover:shadow-[0_0_15px_rgba(192,38,211,0.5)] transition-all font-mono uppercase rounded-none ${!(isGeneratingVideo || isUploadingYouTube) ? 'animate-pulse hover:animate-none' : ''}`}
                      >
                        {(isGeneratingVideo || isUploadingYouTube) ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <AlertCircle className="h-4 w-4 mr-2 hidden" />}
                        {isGeneratingVideo ? 'RECOMPILING...' : 'REGEN_VIDEO'}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="bg-black border border-cyan-500 text-cyan-400 font-mono text-xs rounded-none shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                    <p>Recompile the video using the latest scenes and audio</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {canContinueSeries && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-block">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleContinueSeries} 
                        disabled={isContinuing || isGeneratingVideo}
                        className={`bg-cyan-950/30 hover:bg-cyan-900/50 text-cyan-400 border border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.2)] hover:shadow-[0_0_15px_rgba(6,182,212,0.4)] transition-all font-mono uppercase rounded-none ${!(isContinuing || isGeneratingVideo) ? 'animate-pulse hover:animate-none' : ''}`}
                      >
                        {isContinuing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <BookOpen className="h-4 w-4 mr-2" />}
                        {isContinuing ? 'CONTINUING...' : 'CONTINUE_SERIES'}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="bg-black border border-cyan-500 text-cyan-400 font-mono text-xs rounded-none shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                    <p>Generate the next part of this story sequence</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {story.video_url && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-block">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleDownload} 
                        disabled={isDownloading || downloadCompleted}
                        className={
                          downloadCompleted 
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all font-mono uppercase rounded-none"
                            : `bg-emerald-950/30 hover:bg-emerald-900/50 text-emerald-400 border border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.2)] hover:shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all font-mono uppercase rounded-none ${!isDownloading ? 'animate-pulse hover:animate-none' : ''}`
                        }
                      >
                        {downloadCompleted ? (
                          <CheckCircle className="h-4 w-4 mr-2" />
                        ) : isDownloading ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        {downloadCompleted 
                          ? 'DOWNLOADED!' 
                          : isDownloading 
                            ? (downloadProgress > 0 ? `DL_${downloadProgress}%` : 'INIT_DL...') 
                            : 'DOWNLOAD_VIDEO'
                        }
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="bg-black border border-cyan-500 text-cyan-400 font-mono text-xs rounded-none shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                    <p>Save the final MP4 video to your device</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {story.video_url && !story.youtube_url && (youtubeMainConnected || youtubeSubConnected) && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-2 bg-black p-1 rounded-none border border-cyan-900/50 shadow-[0_0_10px_rgba(6,182,212,0.1)]">
                      <Select value={uploadChannel} onValueChange={(val: 'main' | 'sub') => setUploadChannel(val)}>
                        <SelectTrigger className="w-28 h-7 text-xs border-none shadow-none focus:ring-0 text-cyan-400 font-mono">
                          <SelectValue placeholder="Channel" />
                        </SelectTrigger>
                        <SelectContent className="bg-black border-cyan-900 text-cyan-400 font-mono rounded-none">
                          {youtubeMainConnected && <SelectItem value="main">Main Channel</SelectItem>}
                          {youtubeSubConnected && <SelectItem value="sub">Sub Channel</SelectItem>}
                        </SelectContent>
                      </Select>
                      <div className="w-px h-4 bg-cyan-900/50" />
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={handleUploadYouTube} 
                        disabled={isUploadingYouTube}
                        className={`h-7 text-xs bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 border border-red-900/50 hover:border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.1)] transition-all font-mono uppercase rounded-none ${!isUploadingYouTube ? 'animate-pulse hover:animate-none' : ''}`}
                      >
                        {isUploadingYouTube ? <Loader2 className="h-3 w-3 animate-spin mr-1.5" /> : <Youtube className="h-3 w-3 mr-1.5" />}
                        {isUploadingYouTube ? 'UPLOADING...' : 'UPLOAD_YT'}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="bg-black border border-cyan-500 text-cyan-400 font-mono text-xs rounded-none shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                    <p>Upload this video manually to your YouTube channel</p>
                  </TooltipContent>
                </Tooltip>
              )}
              {hasStuckScenes && !isGeneratingImages && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="inline-block">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleRetryImages} 
                        disabled={isRetrying}
                        className={`bg-amber-950/30 hover:bg-amber-900/50 text-amber-400 border border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)] hover:shadow-[0_0_15px_rgba(245,158,11,0.4)] transition-all font-mono uppercase rounded-none ${!isRetrying ? 'animate-pulse hover:animate-none' : ''}`}
                      >
                        {isRetrying ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                        {isRetrying ? 'RETRYING...' : 'RETRY_IMAGES'}
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="bg-black border border-cyan-500 text-cyan-400 font-mono text-xs rounded-none shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                    <p>Retry generating any images that failed or got stuck</p>
                  </TooltipContent>
                </Tooltip>
              )}
              <div className="flex-1" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-block ml-auto">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleDelete} 
                      disabled={isDeleting}
                      className="bg-red-950/30 hover:bg-red-900/50 text-red-500 border border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)] hover:shadow-[0_0_15px_rgba(239,68,68,0.4)] transition-all font-mono uppercase rounded-none w-full"
                    >
                      {isDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                      {story.status === 'failed' || story.status === 'generating' || story.scenes.some(s => s.image_status === 'failed' || s.image_status === 'generating') ? 'CANCEL_&_DELETE' : 'SYS_DELETE'}
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="bg-black border border-cyan-500 text-cyan-400 font-mono text-xs rounded-none shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                  <p>Permanently delete this story and all its assets</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        )}
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="p-6 bg-black/90">
          {story.video_url && (
            <div className="mb-8 p-5 bg-black rounded-none border border-fuchsia-900/50 shadow-[0_0_20px_rgba(192,38,211,0.15)] relative overflow-hidden">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-4">
                <h3 className="text-fuchsia-400 text-lg font-mono uppercase tracking-widest flex items-center gap-2 drop-shadow-[0_0_5px_rgba(192,38,211,0.8)]">
                  <span className="text-cyan-400">⚡</span> SYSTEM_VIDEO_READY
                </h3>
                {story.youtube_url && (
                  <a href={story.youtube_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs font-mono uppercase text-red-400 hover:text-red-300 bg-red-950/30 px-3 py-1.5 rounded-none border border-red-900/50 shadow-[0_0_10px_rgba(239,68,68,0.2)] transition-colors">
                    <Youtube className="w-4 h-4" />
                    YT_UPLINK (SECURE)
                  </a>
                )}
              </div>
              <video 
                src={story.video_url} 
                controls 
                className="w-full aspect-video rounded-none bg-black border border-cyan-900/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]"
              />
            </div>
          )}

          {story.scenes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 bg-black rounded-none border border-dashed border-cyan-800 shadow-[0_0_15px_rgba(6,182,212,0.1)]">
              <Loader2 className="h-8 w-8 animate-spin text-cyan-500 mb-4 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)]" />
              <p className="text-lg font-mono uppercase tracking-widest text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]">INITIALIZING_NEURAL_NET</p>
              <p className="text-sm font-mono text-cyan-700 mt-2 text-center max-w-sm">
                SYNTHESIZING SCENES // WRITING SCRIPT // GENERATING PROMPTS. PLEASE WAIT...
              </p>
            </div>
          ) : (
            <div className={viewMode === 'card' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6" : "space-y-6"}>
              {story.scenes.map((scene) => (
                <div key={scene.id} className={`flex ${viewMode === 'card' ? 'flex-col' : 'flex-col sm:flex-row'} bg-black rounded-none overflow-hidden border border-cyan-900/40 hover:border-cyan-500/60 shadow-[0_0_10px_rgba(6,182,212,0.05)] hover:shadow-[0_0_15px_rgba(6,182,212,0.2)] transition-all duration-300 group`}>
                  
                  {/* Image Section */}
                  <div className={`relative ${viewMode === 'card' ? 'w-full aspect-video border-b' : 'w-full sm:w-64 md:w-80 shrink-0 border-b sm:border-b-0 sm:border-r'} border-cyan-900/50 bg-zinc-950 flex items-center justify-center overflow-hidden group`}>
                    <div className="absolute top-3 left-3 z-10">
                      <Badge variant="secondary" className="bg-black/90 text-cyan-400 border border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)] font-mono rounded-none uppercase tracking-wider backdrop-blur-md">
                        SYS.SCENE_{scene.scene_number.toString().padStart(2, '0')}
                      </Badge>
                    </div>
                    
                    {editingPromptSceneId === scene.id && (
                      <div className="absolute inset-0 z-20 flex flex-col bg-black/95 p-3 gap-2">
                        <div className="text-xs font-mono text-cyan-400 mb-1 flex items-center gap-2">
                          <Edit2 className="w-3 h-3" /> SYS.EDIT_PROMPT
                        </div>
                        <Textarea 
                          value={editedPrompt}
                          onChange={(e) => setEditedPrompt(e.target.value)}
                          className="flex-1 bg-black/80 border-cyan-900/50 text-cyan-100/70 font-mono text-xs resize-none focus-visible:ring-cyan-500/50 focus-visible:border-cyan-500 rounded-none custom-scrollbar p-2"
                          disabled={isSavingPrompt}
                        />
                        <div className="flex justify-end gap-2 mt-auto">
                          <Button variant="outline" size="sm" onClick={() => { 
                            navigator.clipboard.writeText(editedPrompt); 
                            toast({ title: 'SYS_COPIED', description: 'PROMPT COPIED TO CLIPBOARD.' }); 
                            setHasCopiedPrompt(true);
                            setTimeout(() => setHasCopiedPrompt(false), 2000);
                          }} type="button" className="h-7 text-xs bg-black text-cyan-600 border-cyan-900 hover:text-cyan-400 hover:bg-cyan-950 rounded-none font-mono mr-auto">
                            {hasCopiedPrompt ? <Check className="w-3 h-3 mr-1 text-emerald-400" /> : <Copy className="w-3 h-3 mr-1" />} {hasCopiedPrompt ? 'COPIED' : 'COPY'}
                          </Button>
                          <Button variant="outline" size="sm" onClick={handleCancelEditPrompt} disabled={isSavingPrompt} className="h-7 text-xs bg-black text-cyan-600 border-cyan-900 hover:text-cyan-400 hover:bg-cyan-950 rounded-none font-mono">
                            <X className="w-3 h-3 mr-1" /> CANCEL
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleSavePrompt(scene.id)} disabled={isSavingPrompt} className="h-7 text-xs bg-cyan-950/30 text-cyan-400 border-cyan-500 hover:text-cyan-300 hover:bg-cyan-900/50 hover:shadow-[0_0_10px_rgba(6,182,212,0.4)] rounded-none font-mono">
                            {isSavingPrompt ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />} 
                            SAVE
                          </Button>
                        </div>
                      </div>
                    )}

                    {!editingPromptSceneId && scene.image_status !== 'generating' && (
                      <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex gap-2">
                        <TooltipProvider delayDuration={300}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleEditPrompt(scene);
                                }}
                                className="h-7 w-7 bg-black/80 border-cyan-500/50 text-cyan-400 hover:bg-cyan-950 hover:text-cyan-300 hover:border-cyan-400 rounded-none shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black border border-cyan-500 text-cyan-400 font-mono text-xs rounded-none shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                              <p>EDIT_PROMPT</p>
                            </TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={(e) => {
                                  e.preventDefault();
                                  handleRegenerateImage(scene.id);
                                }}
                                disabled={regeneratingScenes.has(scene.id)}
                                className="h-7 w-7 bg-black/80 border-cyan-500/50 text-cyan-400 hover:bg-cyan-950 hover:text-cyan-300 hover:border-cyan-400 rounded-none shadow-[0_0_10px_rgba(6,182,212,0.3)]"
                              >
                                <RefreshCw className={`h-3 w-3 ${regeneratingScenes.has(scene.id) ? 'animate-spin' : ''}`} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent className="bg-black border border-cyan-500 text-cyan-400 font-mono text-xs rounded-none shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                              <p>REGEN_IMAGE</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    )}
                    
                    {scene.image_url ? (
                      <Image
                        src={scene.image_url}
                        alt={`Scene ${scene.scene_number}`}
                        fill
                        className="object-cover transition-transform duration-700 group-hover:scale-105 opacity-90 group-hover:opacity-100"
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                      />
                    ) : scene.image_status === 'generating' ? (
                      <div className="flex flex-col items-center justify-center p-6 text-center w-full h-full min-h-[200px] bg-fuchsia-950/20">
                        <Loader2 className="h-8 w-8 animate-spin mb-3 text-fuchsia-500 drop-shadow-[0_0_8px_rgba(192,38,211,0.8)]" />
                        <p className="text-xs font-mono uppercase tracking-widest text-fuchsia-400">RENDERING...</p>
                      </div>
                    ) : scene.image_status === 'failed' ? (
                      <div className="flex flex-col items-center justify-center p-6 text-center w-full h-full min-h-[200px] bg-red-950/20">
                        <AlertCircle className="h-8 w-8 mb-3 text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                        <p className="text-xs font-mono uppercase tracking-widest text-red-400">ERR: GENERATION_FAILED</p>
                      </div>
                    ) : scene.image_status === 'skipped' ? (
                      <div className="flex flex-col items-center justify-center p-6 text-center w-full h-full min-h-[200px] bg-zinc-900/50">
                        <div className="w-12 h-12 border border-zinc-700 bg-black flex items-center justify-center mb-3">
                          <span className="text-xl text-zinc-600">⏭</span>
                        </div>
                        <p className="text-xs font-mono uppercase tracking-widest text-zinc-500">BYPASSED</p>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-6 text-center w-full h-full min-h-[200px]">
                        <div className="w-8 h-8 rounded-full border-2 border-cyan-900 border-t-cyan-400 animate-spin mb-3 shadow-[0_0_10px_rgba(6,182,212,0.5)]"></div>
                        <p className="text-xs font-mono uppercase tracking-widest text-cyan-600">AWAITING_RESOURCES</p>
                      </div>
                    )}
                  </div>

                  {/* Script Section */}
                  <div className={`flex flex-col flex-1 p-5 ${viewMode === 'card' ? 'h-48' : ''} bg-black/50 relative group/script`}>
                    {editingSceneId === scene.id ? (
                      <div className="flex flex-col h-full gap-3">
                        <Textarea 
                          value={editedScript}
                          onChange={(e) => setEditedScript(e.target.value)}
                          className="flex-1 min-h-[100px] bg-black/80 border-cyan-900/50 text-cyan-100/70 font-mono text-sm resize-none focus-visible:ring-cyan-500/50 focus-visible:border-cyan-500 rounded-none custom-scrollbar"
                          disabled={isSavingScript}
                        />
                        <div className="flex justify-end gap-2 mt-auto">
                          <Button variant="outline" size="sm" onClick={handleCancelEdit} disabled={isSavingScript} className="h-7 text-xs bg-black text-cyan-600 border-cyan-900 hover:text-cyan-400 hover:bg-cyan-950 rounded-none font-mono">
                            <X className="w-3 h-3 mr-1" /> CANCEL
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleSaveScript(scene.id)} disabled={isSavingScript} className="h-7 text-xs bg-cyan-950/30 text-cyan-400 border-cyan-500 hover:text-cyan-300 hover:bg-cyan-900/50 hover:shadow-[0_0_10px_rgba(6,182,212,0.4)] rounded-none font-mono">
                            {isSavingScript ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Check className="w-3 h-3 mr-1" />} 
                            SAVE
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className={`flex-1 overflow-y-auto pr-2 ${viewMode === 'card' ? 'text-sm' : 'text-base sm:text-sm md:text-base'} text-cyan-100/70 font-mono leading-relaxed space-y-3 custom-scrollbar`}>
                          {scene.script.split('\n').map((paragraph, idx) => (
                            paragraph.trim() ? <p key={idx} className="border-l-2 border-cyan-900/50 pl-3">{paragraph}</p> : null
                          ))}
                        </div>
                        <div className="absolute top-2 right-2 opacity-0 group-hover/script:opacity-100 transition-opacity duration-300">
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    handleEditScript(scene);
                                  }}
                                  className="h-7 w-7 bg-black/80 border-cyan-900/80 text-cyan-600 hover:bg-cyan-950 hover:text-cyan-400 hover:border-cyan-500 rounded-none shadow-[0_0_10px_rgba(6,182,212,0.1)]"
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-black border border-cyan-500 text-cyan-400 font-mono text-xs rounded-none shadow-[0_0_10px_rgba(6,182,212,0.3)]">
                                <p>EDIT_SCRIPT</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </>
                    )}
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
