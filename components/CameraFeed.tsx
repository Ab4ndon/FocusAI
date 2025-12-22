import React, { useEffect, useState } from 'react';
import { VideoCameraSlashIcon } from '@heroicons/react/24/outline';

interface CameraFeedProps {
  videoRef: React.RefObject<HTMLVideoElement>;
}

export const CameraFeed: React.FC<CameraFeedProps> = ({ videoRef }) => {
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  useEffect(() => {
    async function setupCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: "user"
          } 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        setHasPermission(true);
      } catch (err) {
        console.error("Error accessing camera:", err);
        setHasPermission(false);
      }
    }

    setupCamera();

    return () => {
        // Cleanup stream on unmount
        if (videoRef.current && videoRef.current.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(track => track.stop());
        }
    }
  }, [videoRef]);

  if (hasPermission === false) {
    return (
      <div className="w-full aspect-video bg-slate-100 rounded-xl flex flex-col items-center justify-center text-slate-400 border-2 border-dashed border-slate-300">
        <VideoCameraSlashIcon className="w-16 h-16 mb-2" />
        <p>无法访问摄像头，请检查权限设置。</p>
      </div>
    );
  }

  return (
    <div className="w-full aspect-video bg-black rounded-2xl overflow-hidden relative shadow-inner group">
      <video 
        ref={videoRef} 
        className="w-full h-full object-cover transform -scale-x-100 opacity-90" // Mirror effect & slight dim
        playsInline 
        muted 
      />
      
      {/* Viewfinder Overlay */}
      <div className="absolute inset-0 pointer-events-none p-6 flex flex-col justify-between">
         <div className="flex justify-between">
            <div className="w-8 h-8 border-t-4 border-l-4 border-white/40 rounded-tl-lg"></div>
            <div className="w-8 h-8 border-t-4 border-r-4 border-white/40 rounded-tr-lg"></div>
         </div>
         
         {/* Center Target */}
         <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-24 h-24 border border-white/20 rounded-full flex items-center justify-center">
            <div className="w-1 h-1 bg-white/50 rounded-full"></div>
         </div>

         <div className="flex justify-between">
            <div className="w-8 h-8 border-b-4 border-l-4 border-white/40 rounded-bl-lg"></div>
            <div className="w-8 h-8 border-b-4 border-r-4 border-white/40 rounded-br-lg"></div>
         </div>
      </div>

      <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur text-white text-[10px] px-2 py-1 rounded-md font-mono opacity-60">
        LIVE FEED • 1080P
      </div>
    </div>
  );
};