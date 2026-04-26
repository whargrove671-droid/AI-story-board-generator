'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader as Loader2, LogOut, Sparkles, Image as ImageIcon, BookOpen, Youtube, LayoutGrid, LayoutList } from 'lucide-react';
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
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [storyLength, setStoryLength] = useState('5');
  const [loading, setLoading] = useState(false);
  const [stories, setStories] = useState<Story[]>([]);
  const [loadingStories, setLoadingStories] = useState(true);
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [youtubeMainConnected, setYoutubeMainConnected] = useState(false);
  const [youtubeSubConnected, setYoutubeSubConnected] = useState(false);
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  useEffect(() => {
    loadStories();
    checkYouTubeConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkYouTubeConnection = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('user_settings')
        .select('youtube_refresh_token, youtube_sub_refresh_token')
        .eq('user_id', user.id)
        .single();
      
      if (data) {
        if (data.youtube_refresh_token) setYoutubeMainConnected(true);
        if (data.youtube_sub_refresh_token) setYoutubeSubConnected(true);
      }
    } catch (e) {
      // It might fail if user_settings table doesn't exist yet or no row
      console.error('Error checking YouTube connection:', e);
    }
  };

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

  const triggerImageGeneration = async (storyId: string) => {
    let hasMore = true;
    let errorCount = 0;
    
    while (hasMore && errorCount < 3) {
      try {
        const res = await fetch('/api/generate-images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storyId }),
        });
        if (!res.ok) throw new Error('Failed to generate image');
        
        const data = await res.json();
        loadStories();
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
        description: 'Story text generated! Now generating images...',
      });

      setStoryIdea('');
      loadStories();

      // Trigger image generation robustly to prevent server timeout/kill and handle transient errors
      triggerImageGeneration(story.id);
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

  const handleGenerateFromYoutube = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!youtubeUrl.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a YouTube URL',
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
          title: `YouTube Video: ${youtubeUrl}`,
          status: 'generating',
        })
        .select()
        .single();

      if (storyError) throw storyError;

      const response = await fetch('/api/youtube/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeUrl, storyId: story.id }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate story from YouTube');
      }

      toast({
        title: 'Success',
        description: 'Story text generated from YouTube! Now generating images...',
      });

      setYoutubeUrl('');
      loadStories();

      // Trigger image generation robustly to prevent server timeout/kill and handle transient errors
      triggerImageGeneration(story.id);
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
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex flex-col sm:flex-row gap-2">
              {!youtubeMainConnected ? (
                <Button variant="outline" className="border-red-500 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50" onClick={() => window.location.href = '/api/youtube/auth?channel=main'}>
                  Connect Main YouTube
                </Button>
              ) : (
                <div className="text-sm font-medium text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-1.5 rounded-md border border-red-200 dark:border-red-900/50 flex items-center h-10">
                  Main YouTube Connected
                </div>
              )}
              {!youtubeSubConnected ? (
                <Button variant="outline" className="border-red-500 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50" onClick={() => window.location.href = '/api/youtube/auth?channel=sub'}>
                  Connect Sub YouTube
                </Button>
              ) : (
                <div className="text-sm font-medium text-red-500 bg-red-50 dark:bg-red-950/30 px-3 py-1.5 rounded-md border border-red-200 dark:border-red-900/50 flex items-center h-10">
                  Sub YouTube Connected
                </div>
              )}
            </div>
            <Button variant="outline" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card className="shadow-lg h-full flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Generate New Story
              </CardTitle>
              <CardDescription>
                Enter your story idea and let AI create a detailed script with stunning images
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <form onSubmit={handleGenerateStory} className="space-y-4 flex-1 flex flex-col">
                <Textarea
                  placeholder="Enter your story idea here... (e.g., 'A brave knight embarks on a quest to find a magical crystal')"
                  value={storyIdea}
                  onChange={(e) => setStoryIdea(e.target.value)}
                  disabled={loading}
                  rows={4}
                  className="resize-none flex-1"
                />
                <div className="flex flex-col xl:flex-row gap-4 items-center justify-between mt-auto">
                  <div className="w-full xl:w-1/2">
                    <Select value={storyLength} onValueChange={setStoryLength} disabled={loading}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select story length" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">Short (5 Scenes)</SelectItem>
                        <SelectItem value="40">Medium (40 Scenes)</SelectItem>
                        <SelectItem value="120">Long (120 Scenes)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" disabled={loading} className="w-full xl:w-auto">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {loading ? 'Generating...' : 'Generate Story'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card className="shadow-lg h-full flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Youtube className="h-5 w-5 text-red-500" />
                Generate from YouTube Video
              </CardTitle>
              <CardDescription>
                Paste a YouTube URL to automatically extract the narration and turn it into a storyboard
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <form onSubmit={handleGenerateFromYoutube} className="space-y-4 flex-1 flex flex-col justify-between">
                <div className="space-y-4 flex-1 flex flex-col">
                  <Input
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                    disabled={loading}
                    className="w-full"
                  />
                  <div className="text-sm text-muted-foreground p-4 bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed flex-1 flex items-center">
                    <p><strong>Pro tip:</strong> Ensure the video has closed captions enabled. AI will determine the optimal length automatically.</p>
                  </div>
                </div>
                <Button type="submit" disabled={loading} className="w-full bg-red-500 hover:bg-red-600 text-white mt-auto">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? 'Extracting...' : 'Extract & Generate'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-2xl font-bold flex items-center gap-2">
              <ImageIcon className="h-6 w-6" />
              Your Stories
            </h2>
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 p-1 rounded-lg border w-max">
              <Button 
                variant={viewMode === 'card' ? 'secondary' : 'ghost'} 
                size="sm" 
                onClick={() => setViewMode('card')}
                className="h-8 px-3"
              >
                <LayoutGrid className="w-4 h-4 mr-2" />
                Cards
              </Button>
              <Button 
                variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                size="sm" 
                onClick={() => setViewMode('list')}
                className="h-8 px-3"
              >
                <LayoutList className="w-4 h-4 mr-2" />
                List
              </Button>
            </div>
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
                <StoryCard key={story.id} story={story} onRefresh={loadStories} viewMode={viewMode} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
