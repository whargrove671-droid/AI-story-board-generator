'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader as Loader2, CircleAlert as AlertCircle, CircleCheck as CheckCircle, Trash2, Youtube } from 'lucide-react';
import Image from 'next/image';
import { useState, useEffect } from 'react';
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
}

export function StoryCard({ story, onRefresh }: StoryCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isUploadingYouTube, setIsUploadingYouTube] = useState(false);
  const [autoUpload, setAutoUpload] = useState(false);
  const [hasYouTubeConnected, setHasYouTubeConnected] = useState(false);
  const supabase = createClient();
  const { toast } = useToast();

  useEffect(() => {
    // Check if user has YouTube connected so we can show the switch
    const checkYt = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from('user_settings').select('youtube_refresh_token').eq('user_id', user.id).single();
      if (data && data.youtube_refresh_token) {
        setHasYouTubeConnected(true);
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
        toast({ title: 'YouTube Upload', description: 'Uploading video to YouTube as private...' });
        
        const ytResponse = await fetch('/api/youtube/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId: story.id })
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
      toast({ title: 'YouTube Upload', description: 'Uploading video to YouTube as private...' });
      
      const ytResponse = await fetch('/api/youtube/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: story.id })
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

  const handleRetryImages = async () => {
    try {
      setIsRetrying(true);
      const response = await fetch('/api/generate-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyId: story.id }),
      });
      if (!response.ok) throw new Error('Failed to restart image generation');
      
      toast({
        title: 'Started Image Generation',
        description: 'Image generation is running...',
      });
      onRefresh();
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

  return (
    <Card className="shadow-lg overflow-hidden">
      <CardHeader className="border-b bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900">
        <div className="flex items-start justify-between">
          <div className="space-y-1 flex-1">
            <CardTitle className="text-xl">{story.title}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Created {new Date(story.created_at).toLocaleDateString()} at{' '}
              {new Date(story.created_at).toLocaleTimeString()}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {getStatusBadge(story.status)}
            <div className="flex items-center gap-3">
              {(canGenerateVideo || isStuckCompiling || canRegenerateVideo) && hasYouTubeConnected && (
                <div className="flex items-center space-x-2 bg-slate-100 dark:bg-slate-900 px-3 py-1.5 rounded-md border">
                  <Switch 
                    id={`yt-upload-${story.id}`} 
                    checked={autoUpload} 
                    onCheckedChange={setAutoUpload}
                    disabled={isGeneratingVideo || isUploadingYouTube}
                  />
                  <Label htmlFor={`yt-upload-${story.id}`} className="text-sm cursor-pointer flex items-center gap-1">
                    <Youtube className="w-4 h-4 text-red-500" />
                    Auto-Upload to YouTube
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
              {isStuckCompiling && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleGenerateVideo} 
                  disabled={isGeneratingVideo || isUploadingYouTube}
                  className="bg-orange-50 hover:bg-orange-100 text-orange-600 border-orange-200 dark:bg-orange-950/30 dark:hover:bg-orange-900/50 dark:border-orange-900/50"
                >
                  {(isGeneratingVideo) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <AlertCircle className="h-4 w-4 mr-1" />}
                  {isGeneratingVideo ? 'Recompiling...' : 'Force Recompile Video'}
                </Button>
              )}
              {canRegenerateVideo && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleGenerateVideo} 
                  disabled={isGeneratingVideo || isUploadingYouTube}
                  className="bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-900/30 dark:hover:bg-slate-800/50 dark:border-slate-800/50"
                >
                  {(isGeneratingVideo) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <AlertCircle className="h-4 w-4 mr-1 hidden" />}
                  {isGeneratingVideo ? 'Recompiling...' : 'Regenerate Video'}
                </Button>
              )}
              {story.video_url && !story.youtube_url && hasYouTubeConnected && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleUploadYouTube} 
                  disabled={isUploadingYouTube}
                  className="bg-red-50 hover:bg-red-100 text-red-600 border-red-200 dark:bg-red-950/30 dark:hover:bg-red-900/50 dark:border-red-900/50"
                >
                  {isUploadingYouTube ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Youtube className="h-4 w-4 mr-1" />}
                  {isUploadingYouTube ? 'Uploading to YouTube...' : 'Upload to YouTube'}
                </Button>
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
          </div>
        </div>
      </CardHeader>
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

                {scene.image_prompt && scene.image_prompt.trim() !== '' && (
                  <div className="text-xs text-muted-foreground bg-slate-100 dark:bg-slate-900 rounded p-3 border">
                    <span className="font-medium">Image Prompt:</span> {scene.image_prompt}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
