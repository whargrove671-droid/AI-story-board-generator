'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader as Loader2, LogOut, Sparkles, Image as ImageIcon, BookOpen } from 'lucide-react';
import { StoryCard } from '@/components/story-card';

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

export default function DashboardPage() {
  const [storyIdea, setStoryIdea] = useState('');
  const [storyLength, setStoryLength] = useState('5');
  const [loading, setLoading] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [loadingStories, setLoadingStories] = useState(true);
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    loadStories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStories = async () => {
    try {
      const { data: storiesData, error: storiesError } = await supabase
        .from('stories')
        .select('*')
        .order('created_at', { ascending: false });

      if (storiesError) throw storiesError;

      const storiesWithScenes = await Promise.all(
        (storiesData || []).map(async (story) => {
          const { data: scenesData } = await supabase
            .from('scenes')
            .select('*')
            .eq('story_id', story.id)
            .order('scene_number', { ascending: true });

          return {
            ...story,
            scenes: scenesData || [],
          };
        })
      );

      setStories(storiesWithScenes);
    } catch (error) {
      console.error('Error loading stories:', error);
    } finally {
      setLoadingStories(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleGenerateStory = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!storyIdea.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a story idea',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: story, error: storyError } = await supabase
        .from('stories')
        .insert({
          user_id: user.id,
          title: storyIdea,
          status: 'generating',
        })
        .select()
        .single();

      if (storyError) throw storyError;

      const response = await fetch('/api/generate-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ storyIdea, storyId: story.id, storyLength: parseInt(storyLength, 10) }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate story');
      }

      toast({
        title: 'Success',
        description: 'Story generation started! Images will be generated shortly.',
      });

      setStoryIdea('');
      loadStories();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate story',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <header className="border-b bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">AI Story Generator</h1>
              <p className="text-sm text-muted-foreground">Create amazing stories with AI</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <Card className="mb-8 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Generate New Story
            </CardTitle>
            <CardDescription>
              Enter your story idea and let AI create a detailed script with stunning images
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleGenerateStory} className="space-y-4">
              <Textarea
                placeholder="Enter your story idea here... (e.g., 'A brave knight embarks on a quest to find a magical crystal')"
                value={storyIdea}
                onChange={(e) => setStoryIdea(e.target.value)}
                disabled={loading}
                rows={4}
                className="resize-none"
              />
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                <div className="w-full sm:w-72">
                  <Select value={storyLength} onValueChange={setStoryLength} disabled={loading}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select story length" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">Short (5 Scenes, 5 Images)</SelectItem>
                      <SelectItem value="20">Medium (20 Scenes, 5 Images)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" disabled={loading} className="w-full sm:w-auto">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? 'Generating Story...' : 'Generate Story'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <ImageIcon className="h-6 w-6" />
              Your Stories
            </h2>
          </div>

          {loadingStories ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : stories.length === 0 ? (
            <Card className="py-12">
              <CardContent className="text-center">
                <Sparkles className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg text-muted-foreground">No stories yet</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Create your first AI-generated story above
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {stories.map((story) => (
                <StoryCard key={story.id} story={story} onRefresh={loadStories} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
