'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid, Play } from 'lucide-react';
import { useStore } from '@/lib/store';

export default function NewSessionPage() {
  const router = useRouter();
  const [name, setName] = useState('Weekend Open Play');
  const [courtsCount, setCourtsCount] = useState(4);
  const [matchingMode, setMatchingMode] = useState<'balanced' | 'competitive'>('balanced');
  const [courtNames, setCourtNames] = useState<string[]>(['Court 1', 'Court 2', 'Court 3', 'Court 4']);
  const [showCustomNames, setShowCustomNames] = useState(false);
  const { initializeSession, updateSession, currentUser } = useStore();

  useEffect(() => {
    if (!currentUser) router.push('/');
  }, [currentUser, router]);

  useEffect(() => {
    setCourtNames(prev => {
      const next = [...prev];
      while (next.length < courtsCount) {
        next.push(`Court ${next.length + 1}`);
      }
      return next.slice(0, courtsCount);
    });
  }, [courtsCount]);

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    const finalLabels = showCustomNames 
      ? courtNames.map((cn, i) => cn.trim() || `Court ${i + 1}`)
      : undefined;
    const newSession = initializeSession(name, courtsCount, finalLabels);
    updateSession(newSession.id, { matchingMode });
    router.push(`/dashboard/${newSession.id}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-transparent">
      <div className="absolute inset-0 z-[-1] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-blue-100 via-slate-50 to-slate-100 dark:from-slate-800 dark:via-slate-900 dark:to-slate-950"></div>
      
      <div className="glass dark:glass-dark rounded-[2.5rem] p-10 max-w-md w-full animate-slide-up shadow-2xl border-white/40">
        <h1 className="text-4xl font-black mb-8 text-center tracking-tight bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">New Session</h1>
        
        <form onSubmit={handleStart} className="space-y-8">
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 ml-1 uppercase tracking-wider">Session Name</label>
            <input 
              type="text" 
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full px-6 min-h-[64px] text-xl font-bold rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-inner placeholder:text-slate-400"
              placeholder="e.g. Tuesday Night Ladder"
            />
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-end mb-2">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 ml-1 uppercase tracking-wider">Number of Courts</label>
              <div className="bg-gradient-to-r from-blue-500 to-indigo-500 text-white w-10 h-10 rounded-xl flex items-center justify-center font-black text-xl shadow-md">
                {courtsCount}
              </div>
            </div>
            
            <input 
              type="range" 
              min="1" 
              max="10" 
              value={courtsCount}
              onChange={e => setCourtsCount(parseInt(e.target.value))}
              className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-blue-600 shadow-inner"
            />
            
            <div className="flex flex-wrap gap-2 mt-6 justify-center">
              {Array.from({ length: 10 }).map((_, i) => (
                <div 
                  key={i} 
                  onClick={() => setCourtsCount(i + 1)}
                  className={`w-10 h-12 rounded-xl border-2 flex items-center justify-center cursor-pointer transition-all duration-200 ${
                    i < courtsCount 
                      ? 'border-blue-500 bg-gradient-to-b from-blue-400 to-blue-500 text-white shadow-md shadow-blue-500/20 scale-105' 
                      : 'border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 bg-white/50 dark:bg-slate-800/50'
                  }`}
                >
                  <LayoutGrid size={18} />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between items-center px-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Court Names (Optional)
              </label>
              <button
                type="button"
                onClick={() => setShowCustomNames(!showCustomNames)}
                className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showCustomNames ? 'Use default names' : 'Customize court names'}
              </button>
            </div>

            {showCustomNames && (
              <div className="grid grid-cols-2 gap-2.5 p-3 bg-white/60 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 max-h-52 overflow-y-auto">
                {Array.from({ length: courtsCount }).map((_, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Court {i + 1}</span>
                    <input
                      type="text"
                      value={courtNames[i] || ''}
                      onChange={e => {
                        const next = [...courtNames];
                        next[i] = e.target.value;
                        setCourtNames(next);
                      }}
                      placeholder={`Court ${i + 1}`}
                      maxLength={30}
                      className="px-3 py-2 text-sm font-bold rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 ml-1 uppercase tracking-wider">Queue Mode</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMatchingMode('balanced')}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${matchingMode === 'balanced' ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 scale-[1.02]' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 bg-white/50 dark:bg-slate-900/50'}`}
              >
                <div className="font-bold text-slate-800 dark:text-slate-100">Balanced</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">Standard mixer. Focuses on fair wait times and partner variety.</div>
              </button>
              <button
                type="button"
                onClick={() => setMatchingMode('competitive')}
                className={`p-4 rounded-2xl border-2 text-left transition-all ${matchingMode === 'competitive' ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 scale-[1.02]' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300 bg-white/50 dark:bg-slate-900/50'}`}
              >
                <div className="font-bold text-slate-800 dark:text-slate-100">Competitive</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">Ladder style. Groups exact skill levels & matches winners together.</div>
              </button>
            </div>
          </div>

          <button 
            type="submit"
            className="w-full min-h-[64px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-black text-xl rounded-2xl flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 shadow-xl shadow-blue-500/20 mt-4"
          >
            <Play size={24} fill="currentColor" />
            Start Session
          </button>
        </form>
      </div>
    </div>
  );
}
