import * as React from 'react';
import { Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import JSZip from 'jszip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { createClient } from '@/lib/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface RestoreButtonProps {
  // Callback fired when the backup is successfully parsed and ready
  onRestore: (restoredStories: any[]) => void;
  className?: string;
}

export function RestoreButton({ onRestore, className }: RestoreButtonProps) {
  const { toast } = useToast();
  const [isRestoring, setIsRestoring] = React.useState(false);
  const [isDialogOpen, setIsDialogOpen] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const [progress, setProgress] = React.useState(0);
  const [progressText, setProgressText] = React.useState('');

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(file);
      
      if (!loadedZip.file('stories.json')) {
        throw new Error('Missing stories.json');
      }

      setSelectedFile(file);
      setIsDialogOpen(true);
    } catch (error) {
      toast({
        title: 'Invalid Backup File',
        description: 'The selected file is not a valid backup archive or is missing stories.json.',
        variant: 'destructive',
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const confirmRestore = async () => {
    if (!selectedFile) return;

    setIsDialogOpen(false);
    setProgress(0);
    setProgressText('INITIALIZING UPLINK...');
    setIsRestoring(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('You must be logged in to restore data.');

      const zip = new JSZip();
      const loadedZip = await zip.loadAsync(selectedFile);

      // 1. Extract and parse stories.json
      const storiesFile = loadedZip.file('stories.json');
      if (!storiesFile) {
        throw new Error('Invalid backup file: stories.json not found.');
      }
      
      const storiesJson = await storiesFile.async('string');
      let stories;
      try {
        stories = JSON.parse(storiesJson);
      } catch (e) {
        throw new Error('Malformed backup: Invalid JSON format.');
      }

      if (!Array.isArray(stories)) {
        throw new Error('Malformed backup: Expected an array of stories.');
      }

      const totalStories = Math.max(stories.length, 1);
      let completedStories = 0;

      // 2. Extract videos and upload them back to Supabase
      for (const story of stories) {
        const safeTitle = story.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        setProgress(10 + (completedStories / totalStories) * 85);
        setProgressText(`RESTORING STORY ${completedStories + 1} OF ${stories.length}...`);

        if (story.video_url) {
          const videoFile = loadedZip.file(`videos/${safeTitle}.mp4`);
          
          if (videoFile) {
            const videoBlob = await videoFile.async('blob');
            const fileName = `restored_${Date.now()}_${safeTitle}.mp4`;

            // Upload the blob back to Supabase Storage
            const { error: uploadError } = await supabase.storage
              .from('media')
              .upload(fileName, videoBlob, {
                contentType: 'video/mp4',
                upsert: true,
              });

            if (uploadError) {
              console.error(`Failed to upload ${safeTitle}.mp4 to Supabase:`, uploadError);
              // Fallback to local blob URL if upload fails
              story.video_url = URL.createObjectURL(videoBlob);
            } else {
              const { data: publicUrlData } = supabase.storage
                .from('media')
                .getPublicUrl(fileName);
              
              story.video_url = publicUrlData.publicUrl;
            }
          }
        }

        // 3. Extract images and upload them back to Supabase
        if (story.scenes && Array.isArray(story.scenes)) {
          for (let i = 0; i < story.scenes.length; i++) {
            const scene = story.scenes[i];
            if (scene.image_url) {
              const sceneNum = scene.scene_number ?? (i + 1);
              const imageFileName = `${safeTitle}_scene_${sceneNum}.png`;
              const imageFile = loadedZip.file(`images/${imageFileName}`);

              if (imageFile) {
                const imageBlob = await imageFile.async('blob');
                const newImageName = `restored_${Date.now()}_${imageFileName}`;

                const { error: imageUploadError } = await supabase.storage
                  .from('media')
                  .upload(newImageName, imageBlob, {
                    contentType: 'image/png',
                    upsert: true,
                  });

                if (imageUploadError) {
                  console.error(`Failed to upload ${imageFileName} to Supabase:`, imageUploadError);
                  // Fallback to local blob URL if upload fails
                  scene.image_url = URL.createObjectURL(imageBlob);
                } else {
                  const { data: imagePublicUrlData } = supabase.storage
                    .from('media')
                    .getPublicUrl(newImageName);
                  
                  scene.image_url = imagePublicUrlData.publicUrl;
                }
              }
            }
          }
        }

        // 4. Save the restored story to the database
        // Extract scenes so we can insert the story and its scenes into separate tables
        const { scenes, ...storyData } = story;
        
        // Reassign the story to the current user
        storyData.user_id = user.id;

        const { error: storyError } = await supabase
          .from('stories')
          .upsert(storyData);

        if (storyError) throw storyError;

        // 5. Save the associated scenes
        if (scenes && scenes.length > 0) {
          const scenesToInsert = scenes.map((scene: any) => ({
            ...scene,
            story_id: story.id // Explicitly link scenes to this story
          }));

          const { error: scenesError } = await supabase
            .from('scenes')
            .upsert(scenesToInsert);

          if (scenesError) throw scenesError;
        }
        completedStories++;
      }

      setProgress(98);
      setProgressText('FINALIZING...');

      toast({
        title: 'Restore Complete',
        description: 'Your backup was successfully restored and saved to the cloud.',
      });

      // 5. Pass the restored data back to the parent to update local state
      onRestore(stories);
      
    } catch (error: any) {
      console.error('Failed to restore backup:', error);
      toast({
        title: 'Restore Failed',
        description: error.message || 'Failed to restore backup. Please make sure this is a valid backup file.',
        variant: 'destructive',
      });
    } finally {
      setIsRestoring(false);
      setSelectedFile(null);
      // Reset the input so the same file can be selected again if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const cancelRestore = () => {
    setIsDialogOpen(false);
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        type="file"
        accept=".zip"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
      <Button 
        onClick={() => fileInputRef.current?.click()} 
        variant="outline" 
        disabled={isRestoring}
        className={className}
      >
        {isRestoring ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Upload className="mr-2 h-4 w-4" />
        )}
        {isRestoring ? 'Restoring...' : 'Restore Backup'}
      </Button>

      <Dialog open={isRestoring}>
        <DialogContent className="sm:max-w-md bg-black border border-cyan-900/50 shadow-[0_0_30px_rgba(6,182,212,0.15)] rounded-none [&>button]:hidden">
          <DialogHeader>
            <DialogTitle className="text-cyan-400 font-mono uppercase tracking-widest drop-shadow-[0_0_5px_rgba(6,182,212,0.8)]">SYS.RESTORE_PROTOCOL</DialogTitle>
            <DialogDescription className="text-cyan-100/70 font-mono text-xs uppercase tracking-wider">
              {progressText}
            </DialogDescription>
          </DialogHeader>
          <style>{`
            @keyframes scan {
              0% { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
          `}</style>
          <div className="w-full bg-zinc-950 h-2 mt-2 rounded-none border border-cyan-900/30 overflow-hidden relative">
            <div
              className="h-full transition-all duration-300 ease-out shadow-[0_0_10px_rgba(6,182,212,0.5)] relative overflow-hidden bg-[repeating-linear-gradient(45deg,#06b6d4,#06b6d4_10px,#0891b2_10px,#0891b2_20px)]"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            >
              <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white to-transparent opacity-70 [animation:scan_1.5s_linear_infinite]" />
            </div>
          </div>
          <div className="text-right text-xs text-cyan-500 font-mono mt-1 tracking-widest">
            {Math.round(progress)}%
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will overwrite your current stories and local app data with the contents of the backup. Any unbacked-up changes will be permanently lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={cancelRestore}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmRestore}>Continue Restore</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}