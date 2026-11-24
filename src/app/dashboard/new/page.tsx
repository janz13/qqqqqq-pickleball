'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { LayoutGrid, Play, Trophy, Zap, Shuffle } from 'lucide-react';
import BrandMark from '@/components/ui/BrandMark';
import { useStore } from '@/lib/store';
import { SessionType } from '@/types/models';

export default function NewSessionPage() {
  const router = useRouter();
  const [name, setName] = useState('Weekend Open Play');
  const [courtsCount, setCourtsCount] = useState(4);
  const [sessionType, setSessionType] = useState<SessionType>(SessionType.OPEN_PLAY);
  const [matchingMode, setMatchingMode] = useState<'balanced' | 'competitive'>('balanced');
  const [courtNames, setCourtNames] = useState<string[]>(['Court 1', 'Court 2', 'Court 3', 'Court 4']);
  const [showCustomNames, setShowCustomNames] = useState(false);
  const { initializeSession, updateSession, currentUser, _hasHydrated } = useStore();

  useEffect(() => {
    if (_hasHydrated && !currentUser) router.push('/');
  }, [_hasHydrated, currentUser, router]);

  const updateCourtsCount = (nextCount: number) => {
    const clamped = Math.max(1, Math.min(20, Number.isFinite(nextCount) ? nextCount : 4));
    setCourtsCount(clamped);
    setCourtNames(prev => {
      const next = [...prev];
      while (next.length < clamped) {
        next.push(`Court ${next.length + 1}`);
      }
      return next.slice(0, clamped);
    });
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    const finalLabels = showCustomNames 
      ? courtNames.map((cn, i) => cn.trim() || `Court ${i + 1}`)
      : undefined;
    const newSession = initializeSession(name, courtsCount, finalLabels);
    updateSession(newSession.id, { 
      matchingMode: sessionType === SessionType.OPEN_PLAY ? matchingMode : undefined,
      sessionType 
    });
    router.push(`/dashboard/${newSession.id}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-x-clip bg-transparent py-12">
      <div className="absolute inset-0 z-[-1] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-emerald-100/70 via-slate-50 to-slate-100 dark:from-emerald-950/30 dark:via-slate-900 dark:to-slate-950"></div>
      
      <div className="glass dark:glass-dark rounded-[2.5rem] p-8 max-w-lg w-full animate-slide-up shadow-2xl border-slate-200/80 dark:border-slate-700/70">
        <div className="flex items-center justify-center gap-3 mb-8">
          <BrandMark size={40} className="shrink-0" />
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">New Session</h1>
        </div>
        
        <form onSubmit={handleStart} className="space-y-8">
          <div className="space-y-2">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 ml-1 uppercase tracking-wider">Session Name</label>
            <input 
              type="text" 
              value={name}
              onChange={e => setName(e.target.value)}
              required
              className="w-full px-6 min-h-[64px] text-xl font-bold rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-colors duration-150 shadow-inner placeholder:text-slate-400"
              placeholder="e.g. Tuesday Night Ladder"
            />
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-end mb-2">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 ml-1 uppercase tracking-wider">Number of Courts</label>
              <div className="bg-gradient-to-r from-emerald-600 to-teal-600 text-white w-10 h-10 rounded-xl flex items-center justify-center font-black tabular-nums text-xl shadow-md">
                {courtsCount}
              </div>
            </div>
            
            <input 
              type="range" 
              min="1" 
              max="10" 
              value={courtsCount}
              onChange={e => updateCourtsCount(parseInt(e.target.value, 10))}
              className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-emerald-600 shadow-inner"
            />
            
            <div className="flex flex-wrap gap-2 mt-6 justify-center">
              {Array.from({ length: 10 }).map((_, i) => (
                <div 
                  key={i} 
                  onClick={() => updateCourtsCount(i + 1)}
                  className={`w-10 h-12 rounded-xl border-2 flex items-center justify-center cursor-pointer transition-colors duration-150 ${
                    i < courtsCount 
                      ? 'border-emerald-500 bg-gradient-to-b from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-600/20 scale-105' 
                      : 'border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 bg-white/50 dark:bg-slate-800/50'
                  }`}
                >
                  <LayoutGrid size={18} />
                </div>
              ))}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowCustomNames(prev => !prev)}
                className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline"
              >
                {showCustomNames ? 'Hide custom court names' : 'Customize court names'}
              </button>
              {showCustomNames && (
                <div className="mt-3 grid grid-cols-2 gap-2 animate-fade-in">
                  {Array.from({ length: courtsCount }).map((_, idx) => (
                    <input
                      key={idx}
                      type="text"
                      value={courtNames[idx] ?? `Court ${idx + 1}`}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCourtNames(prev => prev.map((c, i) => (i === idx ? val : c)));
                      }}
                      aria-label={`Court ${idx + 1} name`}
                      placeholder={`Court ${idx + 1}`}
                      maxLength={30}
                      className="px-3 py-2 text-sm font-semibold rounded-xl bg-white/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 ml-1 uppercase tracking-wider">Session Format</label>
            <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
              <button
                type="button"
                onClick={() => setSessionType(SessionType.OPEN_PLAY)}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-colors duration-150 ${sessionType === SessionType.OPEN_PLAY ? 'bg-white dark:bg-slate-700 shadow text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
              >
                Open Play
              </button>
              <button
                type="button"
                onClick={() => setSessionType(SessionType.TOURNAMENT_DOUBLES)}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-bold transition-colors duration-150 ${sessionType === SessionType.TOURNAMENT_DOUBLES || sessionType === SessionType.TOURNAMENT_SINGLE_ELIM || sessionType === SessionType.TOURNAMENT_CHAOS ? 'bg-white dark:bg-slate-700 shadow text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'}`}
              >
                Tournament
              </button>
            </div>
          </div>

          {sessionType === SessionType.OPEN_PLAY ? (
            <div className="space-y-3 animate-fade-in">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 ml-1 uppercase tracking-wider">Queue Mode</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setMatchingMode('balanced')}
                  className={`p-4 rounded-2xl border-2 text-left transition-colors duration-150 ${matchingMode === 'balanced' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 scale-[1.01]' : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 bg-white/50 dark:bg-slate-900/50'}`}
                >
                  <div className="font-bold text-slate-800 dark:text-slate-100">Balanced</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">Standard mixer. Focuses on fair wait times and partner variety.</div>
                </button>
                <button
                  type="button"
                  onClick={() => setMatchingMode('competitive')}
                  className={`p-4 rounded-2xl border-2 text-left transition-colors duration-150 ${matchingMode === 'competitive' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 scale-[1.01]' : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 bg-white/50 dark:bg-slate-900/50'}`}
                >
                  <div className="font-bold text-slate-800 dark:text-slate-100">Competitive</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">Ladder style. Groups exact skill levels & matches winners together.</div>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 animate-fade-in">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 ml-1 uppercase tracking-wider">Tournament Structure</label>
              <div className="grid grid-cols-1 gap-3">
                <button
                  type="button"
                  onClick={() => setSessionType(SessionType.TOURNAMENT_DOUBLES)}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${sessionType === SessionType.TOURNAMENT_DOUBLES ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10 scale-[1.02]' : 'border-slate-200 dark:border-slate-700 hover:border-amber-300 bg-white/50 dark:bg-slate-900/50'}`}
                >
                  <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-lg"><Trophy size={18} className="text-amber-500 shrink-0" /> The Grand Slam</div>
                  <div className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed font-medium">
                    Our premium two-stage tournament format for a full day of play.
                  </div>
                  <ul className="text-xs text-slate-500 dark:text-slate-400 mt-2 space-y-1 list-disc list-inside">
                    <li><span className="font-semibold text-slate-600 dark:text-slate-300">Phase 1:</span> Flexible pool play across teams to determine seeding (4 games targeted per team when pool size allows).</li>
                    <li><span className="font-semibold text-slate-600 dark:text-slate-300">Phase 2:</span> Double Elimination Bracket (lose twice and you&apos;re out).</li>
                    <li>Teams stay together for the entire event.</li>
                  </ul>
                </button>
                <button
                  type="button"
                  onClick={() => setSessionType(SessionType.TOURNAMENT_SINGLE_ELIM)}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${sessionType === SessionType.TOURNAMENT_SINGLE_ELIM ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10 scale-[1.02]' : 'border-slate-200 dark:border-slate-700 hover:border-amber-300 bg-white/50 dark:bg-slate-900/50'}`}
                >
                  <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-lg"><Zap size={18} className="text-amber-500 shrink-0" /> Knockout Sprint</div>
                  <div className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed font-medium">
                    A fast, high-stakes classic elimination bracket.
                  </div>
                  <ul className="text-xs text-slate-500 dark:text-slate-400 mt-2 space-y-1 list-disc list-inside">
                    <li><span className="font-semibold text-slate-600 dark:text-slate-300">Format:</span> Pure Single Elimination (lose once and you&apos;re out).</li>
                    <li><span className="font-semibold text-slate-600 dark:text-slate-300">The Finals:</span> Semifinals and Finals are played as &ldquo;Best of 3&rdquo;.</li>
                    <li>Includes a 3rd-place Bronze Medal match.</li>
                  </ul>
                </button>
                <button
                  type="button"
                  onClick={() => setSessionType(SessionType.TOURNAMENT_CHAOS)}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${sessionType === SessionType.TOURNAMENT_CHAOS ? 'border-amber-500 bg-amber-50 dark:bg-amber-500/10 scale-[1.02]' : 'border-slate-200 dark:border-slate-700 hover:border-amber-300 bg-white/50 dark:bg-slate-900/50'}`}
                >
                  <div className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-lg"><Shuffle size={18} className="text-amber-500 shrink-0" /> Chaos Roulette</div>
                  <div className="text-sm text-slate-600 dark:text-slate-300 mt-2 leading-relaxed font-medium">
                    A total random event from start to finish where luck plays a major role.
                  </div>
                  <ul className="text-xs text-slate-500 dark:text-slate-400 mt-2 space-y-1 list-disc list-inside">
                    <li><span className="font-semibold text-slate-600 dark:text-slate-300">Format:</span> Survival elimination. Winners advance, losers are out.</li>
                    <li><span className="font-semibold text-slate-600 dark:text-slate-300">New Partners:</span> Every single round, all survivors are randomly mixed into new pairs!</li>
                    <li>No permanent teams. Only the luckiest and most adaptable survive to the Final Four.</li>
                    <li><span className="font-semibold text-amber-600 dark:text-amber-400">Best with 8, 16 or 32 players.</span> Other counts leave an odd number of teams in a round, and one random team gets a bye.</li>
                  </ul>
                </button>
              </div>
            </div>
          )}

          {/* Sticky footer keeps the primary CTA visible on compact screens */}
          <div className="sticky bottom-0 z-10 -mx-8 -mb-8 px-8 py-5 rounded-b-[2.5rem] bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200/70 dark:border-slate-700/70">
          <button 
            type="submit"
            className="w-full min-h-[64px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xl rounded-2xl flex items-center justify-center gap-3 transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99] shadow-xl shadow-emerald-600/25"
          >
            <Play size={24} fill="currentColor" />
            Start Session
          </button>
          </div>
        </form>
      </div>
    </div>
  );
}
