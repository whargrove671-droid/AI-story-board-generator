'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader as Loader2, CircleAlert as AlertCircle, CircleCheck as CheckCircle, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
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
  const supabase = createClient();
  const { toast } = useToast();

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
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to generate video', variant: 'destructive' });
    } finally {
      setIsGeneratingVideo(false);
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
            <div className="flex items-center gap-2">
              {canGenerateVideo && (
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={handleGenerateVideo} 
                  disabled={isGeneratingVideo}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {isGeneratingVideo ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <AlertCircle className="h-4 w-4 mr-1 hidden" />}
                  Generate Video
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
            <h3 className="text-white text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="text-purple-400">🎬</span> Final Generated Video
            </h3>
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
