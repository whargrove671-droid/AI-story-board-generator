import * as React from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface BackupButtonProps {
  // Provide a function that fetches or returns your stories/videos data
  getData: () => Promise<any> | any;
  fileName?: string;
}

export function BackupButton({ getData, fileName = 'storyboard-backup' }: BackupButtonProps) {
  const handleBackup = async () => {
    try {
      // 1. Fetch the data (from local storage, state, or API)
      const data = await getData();
      
      // 2. Convert data to a JSON string and create a Blob
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      
      // 3. Generate a temporary download URL
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      // Append current date to the filename
      const dateStr = new Date().toISOString().slice(0, 10);
      link.download = `${fileName}-${dateStr}.json`;
      
      // 4. Programmatically click the link to trigger the download
      document.body.appendChild(link);
      link.click();
      
      // 5. Cleanup
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to backup data:', error);
      // Optionally trigger a Toast or Alert component here
    }
  };

  return (
    <Button onClick={handleBackup} variant="outline">
      <Download className="mr-2 h-4 w-4" />
      Backup Data
    </Button>
  );
}