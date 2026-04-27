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
import { BackupButton } from '@/components/backup-button';
import { RestoreButton } from '@/components/restore-button';
import ErrorBoundary from '@/components/error-boundary';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
  video_url?: string | null;
  youtube_url?: string | null;
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
  const [storyToDelete, setStoryToDelete] = useState<Story | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
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
        .select('*, scenes(*)')
        .order('created_at', { ascending: false });

      if (storiesError) throw storiesError;

      const storiesWithScenes = (storiesData || []).map((story) => ({
        ...story,
        // Sort scenes locally since we fetched them in a single joined query
        scenes: (story.scenes || []).sort(
          (a: any, b: any) => (a.scene_number || 0) - (b.scene_number || 0)
        ),
      }));

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
        title: 'ERR.MISSING_INPUT',
        description: 'PLEASE ENTER A STORY DIRECTIVE.',
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
        title: 'SYS.SUCCESS',
        description: 'TEXT GENERATED. INITIALIZING NEURAL RENDERER...',
      });

      setStoryIdea('');
      loadStories();

      // Trigger image generation robustly to prevent server timeout/kill and handle transient errors
      triggerImageGeneration(story.id);
    } catch (error: any) {
      toast({
        title: 'ERR.GEN_FAILED',
        description: error.message || 'FAILED TO GENERATE STORY.',
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
        title: 'ERR.MISSING_INPUT',
        description: 'PLEASE ENTER A YOUTUBE URL.',
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
        title: 'SYS.SUCCESS',
        description: 'TEXT EXTRACTED. INITIALIZING NEURAL RENDERER...',
      });

      setYoutubeUrl('');
      loadStories();

      // Trigger image generation robustly to prevent server timeout/kill and handle transient errors
      triggerImageGeneration(story.id);
    } catch (error: any) {
      toast({
        title: 'ERR.GEN_FAILED',
        description: error.message || 'FAILED TO GENERATE STORY.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!storyToDelete) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('stories').delete().eq('id', storyToDelete.id);
      if (error) throw error;
      
      toast({
        title: 'SYS.PURGE_COMPLETE',
        description: 'STORY DATA PERMANENTLY DELETED.',
      });
      loadStories();
    } catch (error: any) {
      toast({
        title: 'ERR.PURGE_FAILED',
        description: error.message || 'FAILED TO DELETE STORY.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setStoryToDelete(null);
    }
  };

  return (
    <div className="min-h-screen bg-transparent">
      <header className="border-b border-cyan-900/50 bg-black/60 backdrop-blur-md shadow-[0_0_15px_rgba(6,182,212,0.15)] relative z-10">
        <div className="container mx-auto px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 border border-cyan-500 bg-cyan-950/30 shadow-[0_0_10px_rgba(6,182,212,0.5)] rounded-none">
              <Sparkles className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-mono font-bold tracking-widest text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)] uppercase">AI Story Generator</h1>
              <p className="text-xs font-mono text-cyan-700 tracking-widest uppercase">Create amazing stories with AI</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex flex-col sm:flex-row gap-2">
              {!youtubeMainConnected ? (
                <Button variant="outline" className="h-9 text-xs bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 border border-red-900/50 hover:border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.1)] transition-all font-mono uppercase rounded-none animate-pulse hover:animate-none" onClick={() => window.location.href = '/api/youtube/auth?channel=main'}>
                  CONNECT MAIN YT
                </Button>
              ) : (
                <div className="text-xs font-mono tracking-widest text-emerald-400 bg-emerald-950/30 px-3 py-1.5 rounded-none border border-emerald-900/50 shadow-[0_0_10px_rgba(16,185,129,0.2)] uppercase flex items-center h-9">
                  MAIN YT LINKED
                </div>
              )}
              {!youtubeSubConnected ? (
                <Button variant="outline" className="h-9 text-xs bg-red-950/30 hover:bg-red-900/50 text-red-400 hover:text-red-300 border border-red-900/50 hover:border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.1)] transition-all font-mono uppercase rounded-none animate-pulse hover:animate-none" onClick={() => window.location.href = '/api/youtube/auth?channel=sub'}>
                  CONNECT SUB YT
                </Button>
              ) : (
                <div className="text-xs font-mono tracking-widest text-emerald-400 bg-emerald-950/30 px-3 py-1.5 rounded-none border border-emerald-900/50 shadow-[0_0_10px_rgba(16,185,129,0.2)] uppercase flex items-center h-9">
                  SUB YT LINKED
                </div>
              )}
            </div>
            <Button variant="outline" onClick={handleLogout} className="h-9 text-xs bg-black text-cyan-600 border border-cyan-900 hover:text-cyan-400 hover:bg-cyan-950 rounded-none font-mono uppercase">
              <LogOut className="mr-2 h-4 w-4" />
              SYS_LOGOUT
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <ErrorBoundary>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            <Card className="bg-black border border-cyan-900/50 shadow-[0_0_20px_rgba(6,182,212,0.1)] hover:shadow-[0_0_30px_rgba(6,182,212,0.2)] transition-all duration-300 rounded-sm h-full flex flex-col">
              <CardHeader className="border-b border-cyan-900/50 bg-gradient-to-r from-black via-zinc-950 to-black">
                <CardTitle className="text-lg flex items-center gap-2 text-cyan-400 font-mono uppercase tracking-wider drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]">
                  <BookOpen className="h-5 w-5" />
                  INITIALIZE_NEW_SEQUENCE
                </CardTitle>
                <CardDescription className="text-xs font-mono text-cyan-700 uppercase tracking-widest">
                  INPUT STORY PARAMETERS FOR NEURAL SYNTHESIS
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col pt-6 bg-black/90">
                <form onSubmit={handleGenerateStory} className="space-y-4 flex-1 flex flex-col">
                  <Textarea
                    placeholder="INPUT DIRECTIVE... (e.g. 'A CYBERPUNK HACKER INFILTRATES THE MAINFRAME')"
                    value={storyIdea}
                    onChange={(e) => setStoryIdea(e.target.value)}
                    disabled={loading}
                    rows={4}
                    className="resize-none flex-1 bg-black/80 border-cyan-900/50 text-cyan-100/70 font-mono text-sm focus-visible:ring-cyan-500/50 focus-visible:border-cyan-500 rounded-none custom-scrollbar p-3"
                  />
                  <div className="flex flex-col xl:flex-row gap-4 items-center justify-between mt-auto">
                    <div className="w-full xl:w-1/2">
                      <Select value={storyLength} onValueChange={setStoryLength} disabled={loading}>
                        <SelectTrigger className="border-cyan-900/50 bg-black text-cyan-400 font-mono rounded-none focus:ring-cyan-500/50 uppercase">
                          <SelectValue placeholder="SELECT SEQUENCE LENGTH" />
                        </SelectTrigger>
                        <SelectContent className="bg-black border-cyan-900 text-cyan-400 font-mono rounded-none uppercase">
                          <SelectItem value="5">SHORT [05 SCENES]</SelectItem>
                          <SelectItem value="40">MEDIUM [40 SCENES]</SelectItem>
                          <SelectItem value="120">LONG [120 SCENES]</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button type="submit" disabled={loading} className="w-full xl:w-auto bg-fuchsia-600/20 hover:bg-fuchsia-600/40 text-fuchsia-400 border border-fuchsia-500 shadow-[0_0_10px_rgba(192,38,211,0.3)] hover:shadow-[0_0_15px_rgba(192,38,211,0.5)] transition-all font-mono uppercase rounded-none">
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {loading ? 'SYNTHESIZING...' : 'GENERATE_STORY'}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            <Card className="bg-black border border-cyan-900/50 shadow-[0_0_20px_rgba(6,182,212,0.1)] hover:shadow-[0_0_30px_rgba(6,182,212,0.2)] transition-all duration-300 rounded-sm h-full flex flex-col">
              <CardHeader className="border-b border-cyan-900/50 bg-gradient-to-r from-black via-zinc-950 to-black">
                <CardTitle className="text-lg flex items-center gap-2 text-cyan-400 font-mono uppercase tracking-wider drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]">
                  <Youtube className="h-5 w-5 text-red-500 drop-shadow-[0_0_5px_rgba(239,68,68,0.8)]" />
                  EXTRACT_FROM_YOUTUBE
                </CardTitle>
                <CardDescription className="text-xs font-mono text-cyan-700 uppercase tracking-widest">
                  PROVIDE YT_URL TO EXTRACT NARRATION DATA
                </CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col pt-6 bg-black/90">
                <form onSubmit={handleGenerateFromYoutube} className="space-y-4 flex-1 flex flex-col justify-between">
                  <div className="flex-1 flex flex-col">
                    <Input
                      placeholder="HTTPS://WWW.YOUTUBE.COM/WATCH?V=..."
                      value={youtubeUrl}
                      onChange={(e) => setYoutubeUrl(e.target.value)}
                      disabled={loading}
                      className="w-full bg-black/80 border-cyan-900/50 text-cyan-100/70 font-mono text-sm focus-visible:ring-cyan-500/50 focus-visible:border-cyan-500 rounded-none h-10"
                    />
                    <div className="text-xs font-mono text-cyan-600 tracking-wider uppercase p-4 bg-zinc-950/50 rounded-none border border-dashed border-cyan-900/50 flex-1 flex items-center mt-4">
                      <p><strong className="text-cyan-400">SYS_TIP:</strong> ENSURE VIDEO HAS CLOSED CAPTIONS ENABLED. NEURAL NET WILL DETERMINE OPTIMAL SEQUENCE LENGTH.</p>
                    </div>
                  </div>
                  <Button type="submit" disabled={loading} className="w-full bg-red-950/30 hover:bg-red-900/50 text-red-500 hover:text-red-400 border border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)] hover:shadow-[0_0_15px_rgba(239,68,68,0.4)] transition-all font-mono uppercase rounded-none mt-4">
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {loading ? 'EXTRACTING...' : 'EXTRACT_&_GENERATE'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h2 className="text-2xl font-mono font-bold tracking-widest text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.8)] uppercase flex items-center gap-2">
                <ImageIcon className="h-6 w-6" />
                DATA_ARCHIVES
              </h2>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="flex items-center gap-2 bg-black p-1 rounded-none border border-cyan-900/50 shadow-[0_0_10px_rgba(6,182,212,0.1)]">
                <BackupButton getData={() => stories} className="h-8 px-3 rounded-none font-mono uppercase text-xs" />
                <RestoreButton onRestore={() => loadStories()} className="h-8 px-3 rounded-none font-mono uppercase text-xs" />
              </div>
              <div className="flex items-center gap-2 bg-black p-1 rounded-none border border-cyan-900/50 shadow-[0_0_10px_rgba(6,182,212,0.1)] w-max">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setViewMode('card')}
                  className={`h-8 px-3 rounded-none font-mono uppercase text-xs transition-all ${viewMode === 'card' ? 'bg-cyan-950/50 text-cyan-300 border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.3)]' : 'bg-transparent text-cyan-700 hover:text-cyan-400 hover:bg-cyan-950/30 border-transparent'}`}
                >
                  <LayoutGrid className="w-4 h-4 mr-2" />
                  GRID_VIEW
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setViewMode('list')}
                  className={`h-8 px-3 rounded-none font-mono uppercase text-xs transition-all ${viewMode === 'list' ? 'bg-cyan-950/50 text-cyan-300 border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.3)]' : 'bg-transparent text-cyan-700 hover:text-cyan-400 hover:bg-cyan-950/30 border-transparent'}`}
                >
                  <LayoutList className="w-4 h-4 mr-2" />
                  LIST_VIEW
                </Button>
              </div>
            </div>
          </div>

            {loadingStories ? (
              <div className="space-y-6">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="bg-black border border-cyan-900/50 overflow-hidden opacity-70 rounded-sm">
                    <CardHeader className="border-b border-cyan-900/50 bg-zinc-950">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="space-y-3 flex-1 w-full">
                          <div className="h-7 bg-cyan-900/40 rounded-none w-3/4 sm:w-1/3 animate-pulse border border-cyan-900/20" />
                          <div className="flex gap-2">
                            <div className="h-4 bg-cyan-900/40 rounded-none w-16 animate-pulse border border-cyan-900/20" />
                            <div className="h-4 bg-cyan-900/40 rounded-none w-16 animate-pulse hidden sm:block border border-cyan-900/20" />
                            <div className="h-4 bg-cyan-900/40 rounded-none w-20 animate-pulse hidden sm:block border border-cyan-900/20" />
                          </div>
                        </div>
                        <div className="h-6 w-24 bg-cyan-900/40 rounded-none animate-pulse shrink-0 border border-cyan-900/20" />
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : stories.length === 0 ? (
              <Card className="bg-black border border-dashed border-cyan-800 shadow-[0_0_15px_rgba(6,182,212,0.1)] rounded-none py-12">
                <CardContent className="text-center pt-6">
                  <Sparkles className="h-12 w-12 mx-auto mb-4 text-cyan-600 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]" />
                  <p className="text-lg font-mono uppercase tracking-widest text-cyan-500 drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]">NO_DATA_ARCHIVED</p>
                  <p className="text-xs font-mono text-cyan-700 mt-2 tracking-widest uppercase">
                    INITIALIZE A NEW SEQUENCE TO BEGIN
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-6">
                {stories.map((story) => (
                  <ErrorBoundary key={story.id}>
                    <StoryCard story={story} onRefresh={loadStories} viewMode={viewMode} onDelete={setStoryToDelete} />
                  </ErrorBoundary>
                ))}
              </div>
            )}
          </div>
        </ErrorBoundary>

        <AlertDialog open={!!storyToDelete} onOpenChange={(open) => !open && !isDeleting && setStoryToDelete(null)}>
          <AlertDialogContent className="bg-black border border-red-900/50 shadow-[0_0_30px_rgba(239,68,68,0.15)] rounded-none">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-red-400 font-mono uppercase tracking-widest drop-shadow-[0_0_5px_rgba(239,68,68,0.8)]">
                SYS.WARN: DATA_PURGE_REQUESTED
              </AlertDialogTitle>
              <AlertDialogDescription className="text-red-100/70 font-mono text-sm tracking-wider">
                Are you sure you want to permanently delete the story <span className="text-cyan-400 uppercase">"{storyToDelete?.title}"</span>? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting} className="bg-transparent border border-cyan-900/50 text-cyan-400 hover:bg-cyan-950/30 hover:text-cyan-300 rounded-none font-mono uppercase text-xs">
                Cancel
              </AlertDialogCancel>
              <Button disabled={isDeleting} onClick={confirmDelete} className="bg-red-950/30 hover:bg-red-900/50 text-red-500 hover:text-red-400 border border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.2)] rounded-none font-mono uppercase text-xs">
                {isDeleting ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
                {isDeleting ? 'PURGING...' : 'CONFIRM_PURGE'}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
