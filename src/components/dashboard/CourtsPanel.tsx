'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/lib/store';
import { CourtStatus, PlayerStatus, ProposedMatch, Player } from '@/types/models';
import { CourtCard } from '@/components/ui/CourtCard';
import { PlayerCard } from '@/components/ui/PlayerCard';
import { Plus, Play, Repeat, Users, X, PlusCircle } from 'lucide-react';
import { useTTS } from '@/hooks/useTTS';

export default function CourtsPanel() {
  const { courts, players, getUpcomingBatches, startBatch, addCourt } = useStore();
  const tts = useTTS();

  const activeCourtsCount = courts.filter(c => c.status === CourtStatus.IN_PROGRESS).length;
  const openCourtsCount = courts.filter(c => c.status === CourtStatus.OPEN).length;

  const queuedPlayers = players
    .filter(p => p.status === PlayerStatus.AVAILABLE || p.status === PlayerStatus.QUEUED)
    .sort((a, b) => {
      if (a.isLatecomer !== b.isLatecomer) return a.isLatecomer ? -1 : 1;
      return a.queuedAtEpochMs - b.queuedAtEpochMs;
    });

  const engineBatches = getUpcomingBatches();
  const [localBatches, setLocalBatches] = useState<ProposedMatch[]>([]);
  const [swappingPlayer, setSwappingPlayer] = useState<{batchIndex: number, isTeamA: boolean, playerId: string} | null>(null);

  useEffect(() => {
    setTimeout(() => setLocalBatches(engineBatches), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(engineBatches.map(b => [...b.teamA, ...b.teamB].map(p => p.id)))]);

  const handleSwapLocal = (newPlayerId: string) => {
    if (!swappingPlayer) return;
    const newBatches = [...localBatches];
    const batch = newBatches[swappingPlayer.batchIndex];
    const newPlayer = players.find(p => p.id === newPlayerId);
    if (!newPlayer || !batch) return;
    
    if (swappingPlayer.isTeamA) {
      batch.teamA = batch.teamA.map(p => p.id === swappingPlayer.playerId ? newPlayer : p);
    } else {
      batch.teamB = batch.teamB.map(p => p.id === swappingPlayer.playerId ? newPlayer : p);
    }
    setLocalBatches(newBatches);
    setSwappingPlayer(null);
  };

  const handleAddCourt = () => {
    addCourt({
      id: 'c_' + Math.random().toString(36).substr(2, 9),
      label: `Court ${courts.length + 1}`, // Will be overwritten in store correctly
      status: CourtStatus.OPEN,
      currentMatchId: null
    });
  };

  const handleSendToCourt = (batch: ProposedMatch, targetCourt: { id: string, label: string }) => {
    startBatch(batch, targetCourt.id);
    tts.announceCourtAssignment(
      targetCourt.label, 
      batch.teamA.map(p => p.name), 
      batch.teamB.map(p => p.name)
    );
  };

  return (
    <div className="space-y-8 animate-slide-up">
      <div className="flex flex-wrap gap-4">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm px-5 py-3 rounded-full flex items-center gap-3">
          <span className="text-gray-500 font-medium">Total Courts</span>
          <span className="font-bold text-lg">{courts.length}</span>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm px-5 py-3 rounded-full flex items-center gap-3 border-l-4 border-l-amber-500">
          <span className="text-gray-500 font-medium">Active</span>
          <span className="font-bold text-lg text-amber-600">{activeCourtsCount}</span>
        </div>
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm px-5 py-3 rounded-full flex items-center gap-3 border-l-4 border-l-emerald-500">
          <span className="text-gray-500 font-medium">Open</span>
          <span className="font-bold text-lg text-emerald-600">{openCourtsCount}</span>
        </div>
      </div>

      {localBatches.length > 0 && (
        <div className="bg-white dark:bg-gray-900 shadow-sm border border-emerald-200 dark:border-emerald-800/30 p-6 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse-soft" />
            <h2 className="text-xl font-bold tracking-tight text-emerald-800 dark:text-emerald-400">Next Matches Ready</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(() => {
               // Filter out any batches that contain players who are already playing
               // This prevents a race condition where stale localBatches are sent to the next available court
               const validLocalBatches = localBatches.filter(batch => {
                 const allPlayers = [...batch.teamA, ...batch.teamB];
                 return allPlayers.every(p => {
                   const storePlayer = players.find(sp => sp.id === p.id);
                   return storePlayer && storePlayer.status !== PlayerStatus.PLAYING;
                 });
               });

               return validLocalBatches.map((batch, idx) => {
                 const availableCourts = courts.filter(c => c.status === CourtStatus.OPEN);
                 const targetCourt = availableCourts[idx];
              
              return (
                <div key={idx} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl flex flex-col gap-3 relative">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Match {idx + 1}</span>
                    <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded-md text-gray-600 dark:text-gray-300 font-medium">{targetCourt?.label || 'No court'}</span>
                  </div>
                  
                  <div className="space-y-1">
                    {batch.teamA.map(p => (
                      <div key={p.id} className="flex items-center gap-2">
                        <div className="flex-1"><PlayerCard player={p} compact /></div>
                        <button onClick={() => setSwappingPlayer({batchIndex: idx, isTeamA: true, playerId: p.id})} className="p-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 transition-colors">
                          <Repeat size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="text-center text-xs font-bold text-gray-400">VS</div>
                  <div className="space-y-1">
                    {batch.teamB.map(p => (
                      <div key={p.id} className="flex items-center gap-2">
                        <div className="flex-1"><PlayerCard player={p} compact /></div>
                        <button onClick={() => setSwappingPlayer({batchIndex: idx, isTeamA: false, playerId: p.id})} className="p-1.5 rounded-lg bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400 transition-colors">
                          <Repeat size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  {targetCourt && (
                    <button
                      onClick={() => handleSendToCourt(batch, targetCourt)}
                      className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold shadow-sm transition-all duration-200 hover:scale-[1.02]"
                    >
                      <Play size={16} /> Send to Court
                    </button>
                  )}
                </div>
              );
            })})()}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Courts</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {courts.map(court => (
              <CourtCard key={court.id} court={court} />
            ))}
            
            <button
              onClick={handleAddCourt}
              className="flex flex-col items-center justify-center min-h-[220px] rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/20 hover:bg-gray-100 dark:hover:bg-gray-800/50 hover:border-gray-400 dark:hover:border-gray-500 transition-all duration-200 text-gray-500 dark:text-gray-400 group"
            >
              <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center group-hover:scale-110 transition-transform duration-200 mb-3">
                <PlusCircle size={24} className="text-gray-600 dark:text-gray-300" />
              </div>
              <span className="font-medium">Add Court</span>
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Waiting Pool ({queuedPlayers.length})</h2>
          <div className="bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-800 rounded-2xl p-4 min-h-[400px]">
            {queuedPlayers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500 py-12">
                <Users size={48} className="mb-4 opacity-50" />
                <p>No players waiting.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {queuedPlayers.map((player, idx) => (
                  <div key={player.id} className="flex items-center gap-3">
                    <span className="text-sm font-bold text-gray-400 w-5 text-right">{idx + 1}.</span>
                    <div className="flex-1">
                      <PlayerCard player={player} compact />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {swappingPlayer && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-sm w-full shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Swap Player</h3>
              <button onClick={() => setSwappingPlayer(null)} className="p-1 rounded-md text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-2 max-h-64 overflow-y-auto">
              {(() => {
                const playersInBatches = new Set(localBatches.flatMap(b => [...b.teamA, ...b.teamB].map(p => p.id)));
                const eligibleSwapPlayers = queuedPlayers.filter(p => !playersInBatches.has(p.id));
                
                if (eligibleSwapPlayers.length === 0) {
                  return <div className="p-4 text-center text-sm text-gray-500">No available players to swap.</div>;
                }

                return eligibleSwapPlayers.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleSwapLocal(p.id)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex justify-between items-center group"
                  >
                    <span className="font-medium text-gray-800 dark:text-gray-200">{p.name}</span>
                    <span className="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded font-bold">{p.skillLevel}</span>
                  </button>
                ));
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
