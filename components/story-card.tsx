'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader as Loader2, CircleAlert as AlertCircle, CircleCheck as CheckCircle } from 'lucide-react';
import Image from 'next/image';

type Scene = {
  id: string;
  scene_number: number;
  script: string;
  image_prompt: string;
  image_url: string | null;
  image_status: string;
};

type Story = {
  id: string;
  title: string;
  status: string;
  created_at: string;
  scenes: Scene[];
};

interface StoryCardProps {
  story: Story;
  onRefresh: () => void;
}

export function StoryCard({ story, onRefresh }: StoryCardProps) {
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
            Generating
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
          {getStatusBadge(story.status)}
        </div>
      </CardHeader>
      <CardContent className="p-6">
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
                ) : (
                  <div className="w-full aspect-video rounded-lg border bg-slate-50 dark:bg-slate-900 flex items-center justify-center">
                    <p className="text-sm text-muted-foreground">Waiting to generate image...</p>
                  </div>
                )}

                <div className="text-xs text-muted-foreground bg-slate-100 dark:bg-slate-900 rounded p-3 border">
                  <span className="font-medium">Image Prompt:</span> {scene.image_prompt}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
