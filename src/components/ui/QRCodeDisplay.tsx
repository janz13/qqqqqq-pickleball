"use client";
import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Link as LinkIcon, X } from 'lucide-react';

interface Props {
  joinCode?: string;
  size?: number;
  onClose?: () => void;
}

export default function QRCodeDisplay({ joinCode, size = 256, onClose }: Props) {
  // Use a placeholder if not provided, usually comes from store in actual use
  const actualJoinCode = joinCode || 'ABCDE';
  const url = typeof window !== 'undefined' ? `${window.location.origin}/session/${actualJoinCode}` : `/session/${actualJoinCode}`;

  const copyLink = () => {
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
  };

  const downloadQR = () => {
    const svg = document.getElementById('session-qr-code');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = size;
      canvas.height = size;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL('image/png');
      const downloadLink = document.createElement('a');
      downloadLink.download = `session-${actualJoinCode}.png`;
      downloadLink.href = `${pngFile}`;
      downloadLink.click();
    };
    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  };

  return (
    <div className="relative flex flex-col items-center gap-6 glass dark:glass-dark p-8 rounded-3xl max-w-sm mx-auto shadow-2xl animate-slide-up border border-white/40">
      {onClose && (
        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100/50 dark:bg-slate-800/50 rounded-full transition-colors">
          <X size={20} />
        </button>
      )}

      <div className="text-center mt-2">
        <h2 className="text-2xl font-black tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">Scan to Join</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2 text-sm font-medium">Players can scan this code to see the live queue and courts.</p>
      </div>
      
      <div className="bg-white p-4 rounded-2xl shadow-inner border border-slate-200">
        <QRCodeSVG id="session-qr-code" value={url} size={size} level="H" includeMargin={true} />
      </div>
      
      <div className="w-full text-center">
        <div className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-1">Join Code</div>
        <div className="text-4xl font-mono font-black tracking-widest text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800/50 px-6 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-inner">
          {actualJoinCode}
        </div>
      </div>
      
      <div className="flex gap-3 w-full mt-2">
        <button onClick={copyLink} className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-slate-100/80 hover:bg-slate-200 dark:bg-slate-800/80 dark:hover:bg-slate-700 rounded-xl transition-all duration-200 text-slate-700 dark:text-slate-300 font-semibold shadow-sm hover:scale-[1.02]">
          <LinkIcon size={18} /> Copy Link
        </button>
        <button onClick={downloadQR} className="flex-1 flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 font-semibold shadow-md shadow-blue-500/20 hover:scale-[1.02]">
          <Download size={18} /> Save QR
        </button>
      </div>

      {!process.env.NEXT_PUBLIC_SUPABASE_URL && (
        <div className="mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-700 dark:text-amber-400 font-medium">
          Note: Because a database is not configured, links will only work on this exact device and browser. To share across devices, configure Supabase.
        </div>
      )}
    </div>
  );
}
