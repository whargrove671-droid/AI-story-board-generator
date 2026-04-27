import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import JSZip from 'jszip';

// A minimal interface for the data we expect.
// This helps ensure that we get the necessary video_url.
interface StoryWithVideo {
  title: string;
  video_url?: string | null;
  // other story properties can exist, but we only need these for the backup.
}

interface BackupButtonProps {
  // The function should return all stories, including their video URLs.
  getData: () => Promise<StoryWithVideo[]> | StoryWithVideo[];
  fileName?: string;
}

export function BackupButton({ getData, fileName = 'storyboard-backup' }: BackupButtonProps) {
  const [isBackingUp, setIsBackingUp] = React.useState(false);

  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      // 1. Fetch the story data
      const stories: StoryWithVideo[] = await getData();
      
      const zip = new JSZip();

      // 2. Add the main data file to the zip
      const jsonString = JSON.stringify(stories, null, 2);
      zip.file('stories.json', jsonString);

      // 3. Create a folder for videos
      const videoFolder = zip.folder('videos');

      if (videoFolder) {
        // 4. Fetch each video and add it to the 'videos' folder in the zip
        const videoPromises = stories
          .filter(story => !!story.video_url)
          .map(async (story) => {
            try {
              const response = await fetch(story.video_url!);
              if (!response.ok) {
                console.error(`Failed to fetch video for story: ${story.title}`);
                return; // Skip this video
              }
              const videoBlob = await response.blob();
              const safeFileName = `${story.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4`;
              videoFolder.file(safeFileName, videoBlob);
            } catch (error) {
              console.error(`Error processing video for story "${story.title}":`, error);
            }
          });
  
        await Promise.all(videoPromises);
      }

      // 5. Generate the .zip file blob
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // 6. Generate a temporary download URL and trigger the download
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
    } catch (error) {
      console.error('Failed to create backup zip:', error);
      // Optionally trigger a Toast or Alert component here
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <Button onClick={handleBackup} variant="outline" disabled={isBackingUp}>
      {isBackingUp ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <Download className="mr-2 h-4 w-4" />
      )}
      {isBackingUp ? 'Creating Backup...' : 'Backup Data'}
    </Button>
  );
}