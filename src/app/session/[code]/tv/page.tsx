'use client';

import { useParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { CourtStatus, PlayerStatus } from '@/types/models';
import { PlayerCard } from '@/components/ui/PlayerCard';
import { CourtCard } from '@/components/ui/CourtCard';
import QRCodeDisplay from '@/components/ui/QRCodeDisplay';
import { useEffect, useState } from 'react';

export default function TVDisplayPage() {
  const { code } = useParams();
  const { session, courts, players } = useStore();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!session || session.joinCode !== code) {
    return <div className="min-h-screen bg-black text-white flex items-center justify-center p-8 text-4xl">Waiting for session...</div>;
  }

  const queuedPlayers = players
    .filter(p => p.status === PlayerStatus.AVAILABLE || p.status === PlayerStatus.QUEUED)
    .sort((a, b) => a.queuedAtEpochMs - b.queuedAtEpochMs);
    
  const upNext = queuedPlayers.slice(0, 8);

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-hidden flex flex-col font-sans">
      <header className="bg-slate-900/80 p-6 flex justify-between items-center border-b border-slate-800 backdrop-blur-xl shrink-0">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
            <span className="text-2xl font-black">Q</span>
          </div>
          <div>
            <h1 className="text-4xl font-black tracking-tight">{session.name}</h1>
            <div className="flex gap-4 mt-2">
              <span className="text-emerald-400 font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> LIVE
              </span>
              <span className="text-slate-400 text-sm font-bold uppercase tracking-wider">{courts.filter(c => c.status === CourtStatus.IN_PROGRESS).length} / {courts.length} Courts Active</span>
            </div>
          </div>
        </div>
        <div className="text-6xl font-black font-mono tracking-tighter text-slate-200 drop-shadow-lg">
          {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </header>

      <main className="flex-1 flex p-6 gap-6 overflow-hidden">
        <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-max overflow-y-auto pr-2 pb-6 custom-scrollbar">
          {courts.map(court => (
            <div key={court.id} className="transform scale-100 origin-top">
              <CourtCard court={court} />
            </div>
          ))}
        </div>

        <aside className="w-96 flex flex-col gap-6 shrink-0">
          <div className="glass-dark rounded-3xl p-6 border border-slate-800 flex-1 overflow-hidden flex flex-col">
            <h2 className="text-2xl font-black mb-6 tracking-tight text-blue-400 uppercase">Up Next</h2>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
              {upNext.length === 0 ? (
                <div className="text-slate-600 font-bold text-center mt-10 text-xl">Queue Empty</div>
              ) : (
                upNext.map((player, idx) => (
                  <div key={player.id} className="flex items-center gap-4 bg-slate-900/50 p-3 rounded-2xl border border-slate-800">
                    <span className="text-2xl font-black text-slate-700 w-8 text-right font-mono">{idx + 1}</span>
                    <div className="flex-1">
                      <PlayerCard player={player} compact />
                    </div>
                  </div>
                ))
              )}
            </div>
            {queuedPlayers.length > 8 && (
              <div className="pt-4 mt-2 border-t border-slate-800 text-center font-bold text-slate-500">
                + {queuedPlayers.length - 8} more waiting
              </div>
            )}
          </div>
          
          <div className="transform origin-bottom scale-90 -mb-6 mx-auto">
            <QRCodeDisplay joinCode={session.joinCode} size={200} />
          </div>
        </aside>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 8px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 4px; }
      `}} />
    </div>
  );
}
