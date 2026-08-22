"use client";
import React from 'react';
import { useTTS } from '@/hooks/useTTS';
import { Volume2, Mic, Play } from 'lucide-react';

export default function TTSSettingsPanel() {
  const tts = useTTS();

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto animate-slide-up">
      <h2 className="text-3xl font-black tracking-tight text-slate-800 dark:text-slate-100">Announcements</h2>
      
      <div className="glass dark:glass-dark p-8 rounded-3xl flex flex-col gap-8 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 flex items-center justify-center text-white shadow-md">
              <Volume2 size={24} />
            </div>
            <div>
              <h3 className="font-bold text-xl tracking-tight">Enable Text-to-Speech</h3>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium mt-1">Automatically announce court assignments.</p>
            </div>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={tts.isEnabled} onChange={(e) => tts.setEnabled(e.target.checked)} />
            <div className="w-14 h-8 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-blue-500 peer-checked:to-indigo-500 shadow-inner"></div>
          </label>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 pt-8 flex flex-col gap-6">
          <div className="space-y-2">
            <label className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-300">
              <Mic size={18} /> Voice Selection
            </label>
            <div className="relative">
              <select 
                className="w-full appearance-none bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-4 font-medium focus:ring-2 focus:ring-blue-500 outline-none transition-all disabled:opacity-50"
                value={tts.selectedVoice?.name || ''}
                onChange={(e) => {
                  const voice = tts.availableVoices.find(v => v.name === e.target.value);
                  if (voice) tts.setSelectedVoice(voice);
                }}
                disabled={!tts.isEnabled}
              >
                {tts.availableVoices.map(v => (
                  <option key={v.name} value={v.name}>{v.name} ({v.lang})</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="font-bold text-slate-700 dark:text-slate-300">Speech Rate</label>
              <span className="font-mono bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 px-3 py-1 rounded-full text-sm font-bold">
                {tts.rate.toFixed(1)}x
              </span>
            </div>
            <input 
              type="range" 
              min="0.5" max="2" step="0.1" 
              value={tts.rate}
              onChange={(e) => tts.setRate(parseFloat(e.target.value))}
              className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-600"
              disabled={!tts.isEnabled}
            />
          </div>

          <button 
            onClick={() => tts.announceCourtAssignment('Court 1', ['Alice', 'Bob'], ['Charlie', 'Dave'])}
            disabled={!tts.isEnabled}
            className="mt-4 w-full py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white font-bold rounded-2xl flex items-center justify-center gap-2 disabled:opacity-50 disabled:grayscale transition-all duration-200 shadow-lg shadow-emerald-500/20 active:scale-95"
          >
            <Play size={20} fill="currentColor" />
            Test Announcement
          </button>
        </div>
      </div>
    </div>
  );
}
