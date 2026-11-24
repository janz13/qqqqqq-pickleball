'use client';

import { useState } from 'react';
import { useTTS } from '@/hooks/useTTS';
import { useStore } from '@/lib/store';
import { Megaphone, Play } from 'lucide-react';

export default function AnnouncementPanel() {
  const tts = useTTS();
  const { broadcastAnnouncement } = useStore();
  const [text, setText] = useState('');

  const handleAnnounce = () => {
    if (text.trim().length > 0) {
      tts.speak(text.trim(), true); // force announce even if disabled
      broadcastAnnouncement(text.trim());
      setText('');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-slide-up">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-xl shadow-sm">
          <Megaphone size={24} />
        </div>
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Announcements</h2>
          <p className="text-gray-500 dark:text-gray-400">Broadcast a custom message over the PA system.</p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
        <label className="font-semibold text-gray-700 dark:text-gray-300">Custom Announcement</label>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="e.g. 'Tournament starting in 5 minutes!'"
          className="w-full min-h-[120px] p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none resize-none transition-colors duration-150 text-black dark:text-white"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={handleAnnounce}
            disabled={text.trim().length === 0}
            className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl disabled:opacity-50 transition-colors duration-150 shadow-md shadow-emerald-600/20 flex items-center gap-2"
          >
            <Play size={18} fill="currentColor" /> Announce
          </button>
        </div>
      </div>
    </div>
  );
}
