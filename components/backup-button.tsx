import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface SceneWithImage {
  scene_number?: number;
  image_url?: string | null;
}

// A minimal interface for the data we expect.
// This helps ensure that we get the necessary video_url.
interface StoryWithVideo {
  id?: string;
  title: string;
  video_url?: string | null;
  scenes?: SceneWithImage[];
  // other story properties can exist, but we only need these for the backup.
}

interface BackupButtonProps {
  // The function should return all stories, including their video URLs.
  getData: () => Promise<StoryWithVideo[]> | StoryWithVideo[];
  fileName?: string;
  className?: string;
}

export function BackupButton({ getData, fileName = 'storyboard-backup', className }: BackupButtonProps) {
  const [isBackingUp, setIsBackingUp] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const [progressText, setProgressText] = React.useState('');
  const { toast } = useToast();

  const progressBarRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (progressBarRef.current) {
      progressBarRef.current.style.width = `${Math.min(100, Math.max(0, progress))}%`;
    }
  }, [progress]);

  const handleBackup = async () => {
    setProgress(0);
    setProgressText('FETCHING STORY DATA...');
    setIsBackingUp(true);
    try {
      // 1. Fetch the story data
      const stories: StoryWithVideo[] = await getData();
      
      setProgress(10);
      setProgressText('PREPARING MEDIA FILES...');
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      // 2. Add the main data file to the zip
      const jsonString = JSON.stringify(stories, null, 2);
      zip.file('stories.json', jsonString);

      // 3. Create folders for media
      const videoFolder = zip.folder('videos');
      const imageFolder = zip.folder('images');

      // We will store functions that return promises, so they don't execute immediately
      const downloadTasks: (() => Promise<void>)[] = [];

      // 4. Fetch each video and image, adding them to the zip
      stories.forEach((story, index) => {
        const safeTitle = `${story.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${story.id || index}`;

        // Queue video downloads
        if (story.video_url && videoFolder) {
          const videoUrl = story.video_url;
          downloadTasks.push(() =>
            fetch(videoUrl)
              .then((res) => { if (!res.ok) throw new Error(`Status ${res.status}`); return res.blob(); })
              .then((blob) => { videoFolder.file(`${safeTitle}.mp4`, blob); })
              .catch((err) => console.error(`Error processing video for story "${story.title}":`, err))
          );
        }

        // Queue image downloads
        if (story.scenes && Array.isArray(story.scenes) && imageFolder) {
          story.scenes.forEach((scene, index) => {
            if (scene.image_url) {
              const imageUrl = scene.image_url;
              downloadTasks.push(() =>
                fetch(imageUrl)
                  .then((res) => { if (!res.ok) throw new Error(`Status ${res.status}`); return res.blob(); })
                  .then((blob) => {
                    const sceneNum = scene.scene_number ?? (index + 1);
                    imageFolder.file(`${safeTitle}_scene_${sceneNum}.png`, blob);
                  })
                  .catch((err) => console.error(`Error processing image for story "${story.title}", scene ${index}:`, err))
              );
            }
          });
        }
      });

      // 5. Process downloads in chunks of 5 to avoid overloading the browser network limit
      const CHUNK_SIZE = 5;
      const totalTasks = Math.max(downloadTasks.length, 1);
      let completedTasks = 0;
      for (let i = 0; i < downloadTasks.length; i += CHUNK_SIZE) {
        const chunk = downloadTasks.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map((task) => task()));
        completedTasks += chunk.length;
        setProgress(10 + (completedTasks / totalTasks) * 80);
        setProgressText(`DOWNLOADING MEDIA... (${completedTasks} / ${downloadTasks.length})`);
      }

      setProgress(90);
      setProgressText('COMPRESSING TO ZIP ARCHIVE...');
      // 6. Generate the .zip file blob
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // 7. Generate a temporary download URL and trigger the download
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      
      const dateStr = new Date().toISOString().slice(0, 10);
      link.download = `${fileName}-${dateStr}.zip`;
      
      document.body.appendChild(link);
      link.click();
      
      // 7. Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setProgress(100);
      setProgressText('BACKUP COMPLETE!');
      
      toast({
        title: 'Backup Complete',
        description: 'Your backup was successfully created and downloaded.',
      });
      
      // Add a short delay so the user can see the 100% completion message before it auto-closes
      await new Promise(resolve => setTimeout(resolve, 1500));
    } catch (error) {
      console.error('Failed to create backup zip:', error);
      toast({
        title: 'Backup Failed',
        description: 'Failed to create backup. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <>
      <Button onClick={handleBackup} variant="outline" disabled={isBackingUp} className={className}>
        {isBackingUp ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Download className="mr-2 h-4 w-4" />
        )}
        {isBackingUp ? 'Creating Backup...' : 'Backup Data'}
      </Button>

      <Dialog open={isBackingUp}>
        <DialogContent className="sm:max-w-md bg-black border border-cyan-900/50 shadow-[0_0_30px_rgba(6,182,212,0.15)] rounded-none [&>button]:hidden">
          <DialogHeader>
            <DialogTitle className="text-cyan-400 font-mono uppercase tracking-widest drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]">SYS.BACKUP_PROTOCOL</DialogTitle>
            <DialogDescription className="text-cyan-100/70 font-mono text-xs uppercase tracking-wider">
              {progressText}
            </DialogDescription>
          </DialogHeader>
          <div className="w-full bg-zinc-950 h-2 mt-2 rounded-none border border-cyan-900/30 overflow-hidden relative">
            <div
              ref={progressBarRef}
              className="bg-cyan-500 h-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(6,182,212,0.5)]"
            />
          </div>
          <div className="text-right text-xs text-cyan-500 font-mono mt-1 tracking-widest">
            {Math.round(progress)}%
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}