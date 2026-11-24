'use client';

import { useEffect, useState } from 'react';
import { useStore } from '@/lib/store';
import { Court, CourtStatus, Team, Player, PlayerStatus } from '@/types/models';
import { Clock, Trash2, AlertCircle, CheckCircle, Repeat, Pencil, Check, X } from 'lucide-react';
import { PlayerCard } from './PlayerCard';
import { ScoreDialog } from './ScoreDialog';
import { useTTS } from '@/hooks/useTTS';

export function CourtCard({ court, readOnly = false }: { court: Court, readOnly?: boolean }) {
  const { matches, players, completeMatch, updateCourt, removeCourt, swapPlayerInMatch } = useStore();
  const tts = useTTS();
  const [now, setNow] = useState(() => Date.now());
  const [swappingPlayerId, setSwappingPlayerId] = useState<string | null>(null);
  const [showScoreDialog, setShowScoreDialog] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [editedLabel, setEditedLabel] = useState(court.label);

  const startEditingLabel = () => {
    setEditedLabel(court.label);
    setIsEditingLabel(true);
  };

  const handleSaveLabel = () => {
    const trimmed = editedLabel.trim();
    if (trimmed && trimmed !== court.label) {
      updateCourt({ ...court, label: trimmed });
    } else {
      setEditedLabel(court.label);
    }
    setIsEditingLabel(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveLabel();
    } else if (e.key === 'Escape') {
      setEditedLabel(court.label);
      setIsEditingLabel(false);
    }
  };

  const match = (court.currentMatchId ? matches.find(m => m.id === court.currentMatchId) : null)
    || matches.find(m => m.courtId === court.id && !m.endedAtEpochMs)
    || null;
  const teamA = match ? match.teamA.map(id => players.find(p => p.id === id)!).filter(Boolean) : [];
  const teamB = match ? match.teamB.map(id => players.find(p => p.id === id)!).filter(Boolean) : [];
  
  const activeMatches = matches.filter(m => m.endedAtEpochMs == null);
  const activePlayerIds = new Set(activeMatches.flatMap(m => [...m.teamA, ...m.teamB]));
  const availablePlayers = players.filter(
    p => p.status === PlayerStatus.AVAILABLE && !p.currentCourtId && !activePlayerIds.has(p.id)
  );

  const handleCompleteMatch = (winner: Team) => {
    if (!match) return;
    
    const winningTeam = winner === Team.A ? teamA : teamB;
    const winningNames = winningTeam.map(p => p.name).join(' and ');
    
    tts.speak(`Congratulations to ${winningNames} for winning on ${court.label}.`);
    completeMatch(match.id, winner, winner === Team.A ? 11 : 0, winner === Team.B ? 11 : 0);
  };

  useEffect(() => {
    if (!match || court.status !== CourtStatus.IN_PROGRESS) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [match, court.status]);

  let elapsed = '00:00';
  if (match && court.status === CourtStatus.IN_PROGRESS) {
    const diff = Math.floor((now - match.startedAtEpochMs) / 1000);
    const m = Math.floor(Math.max(0, diff) / 60).toString().padStart(2, '0');
    const s = (Math.max(0, diff) % 60).toString().padStart(2, '0');
    elapsed = `${m}:${s}`;
  }

  const headerGradient = 
    court.status === CourtStatus.OPEN ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100' : 
    court.status === CourtStatus.IN_PROGRESS ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white' : 
    'bg-rose-500 text-white';

  const renderRemoveCourtButton = () => (
    <button
      type="button"
      onClick={() => {
        if (confirmingRemove) {
          removeCourt(court.id);
          setConfirmingRemove(false);
        } else {
          setConfirmingRemove(true);
        }
      }}
      onBlur={() => setConfirmingRemove(false)}
      className={`px-3.5 min-h-[44px] rounded-xl text-xs font-bold transition-colors duration-150 flex items-center justify-center gap-1.5 whitespace-nowrap ${
        confirmingRemove
          ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm'
          : 'bg-gray-100 text-gray-500 hover:text-rose-500 hover:bg-rose-50 dark:bg-gray-800 dark:text-gray-400'
      }`}
      aria-label={confirmingRemove ? 'Confirm remove court' : 'Remove Court'}
      title={confirmingRemove ? 'Click again to remove court' : 'Remove Court'}
    >
      <Trash2 size={16} />
      {confirmingRemove && <span>Confirm?</span>}
    </button>
  );

  return (
    <div className="flex flex-col bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden transition-colors duration-200">
      <div className={`flex items-center justify-between p-4 ${headerGradient}`}>
        <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
          {isEditingLabel && !readOnly ? (
            <div className="flex items-center gap-1.5 flex-1" onClick={e => e.stopPropagation()}>
              <input
                type="text"
                value={editedLabel}
                onChange={e => setEditedLabel(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
                className="w-full px-2.5 py-1 text-sm font-bold rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400 shadow-sm"
                placeholder="Court Name"
                maxLength={30}
              />
              <button
                onClick={handleSaveLabel}
                className="p-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shrink-0 shadow-sm"
                title="Save court name"
              >
                <Check size={14} />
              </button>
              <button
                onClick={() => {
                  setEditedLabel(court.label);
                  setIsEditingLabel(false);
                }}
                className="p-1 rounded-md bg-gray-500/50 hover:bg-gray-600/60 text-white transition-colors shrink-0"
                title="Cancel"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0 group">
              <h3 
                className={`font-bold tracking-tight text-lg truncate ${!readOnly ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''}`}
                onClick={() => !readOnly && startEditingLabel()}
                title={!readOnly ? "Click to rename court" : undefined}
              >
                {court.label}
              </h3>
              {!readOnly && (
                <button
                  onClick={startEditingLabel}
                  className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 opacity-60 hover:opacity-100 transition-opacity duration-150 text-current shrink-0"
                  title="Edit Court Name"
                >
                  <Pencil size={14} />
                </button>
              )}
            </div>
          )}
        </div>
        {court.status === CourtStatus.IN_PROGRESS && (
          <div className="flex items-center gap-2">
            {!readOnly && (
              <button 
                onClick={() => tts.announceCourtAssignment(court.label, teamA.map(p => p.name), teamB.map(p => p.name), true)}
                className="p-1.5 bg-black/20 hover:bg-black/40 rounded-full transition-colors text-white backdrop-blur-sm"
                title="Announce match"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-5v12L3 14v-3z"></path><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"></path></svg>
              </button>
            )}
            <div className="flex items-center gap-1.5 font-mono tabular-nums text-lg font-semibold bg-black/20 px-3 py-1 rounded-full backdrop-blur-sm text-white">
              <Clock size={16} />
              <span>{elapsed}</span>
            </div>
          </div>
        )}
      </div>

      <div className="p-5 flex-grow flex flex-col justify-center min-h-[160px]">
        {court.status === CourtStatus.IN_PROGRESS && teamA.length > 0 && teamB.length > 0 ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              {teamA.map((p: Player) => (
                <div key={p.id} className="relative group flex items-center gap-2">
                  <div className="flex-1 min-w-0"><PlayerCard player={p} compact /></div>
                  {!readOnly && (
                    <button type="button" onClick={() => setSwappingPlayerId(p.id)} aria-label={`Swap ${p.name}`} title={`Swap ${p.name}`} className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-500 transition-colors shrink-0">
                      <Repeat size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            
            <div className="flex items-center justify-center gap-3">
              <div className="h-px w-12 bg-gray-200 dark:bg-gray-700"></div>
              <span className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-xs font-bold text-gray-400 border border-gray-200 dark:border-gray-700 shadow-sm">
                VS
              </span>
              <div className="h-px w-12 bg-gray-200 dark:bg-gray-700"></div>
            </div>
            
            <div className="flex flex-col gap-2">
              {teamB.map((p: Player) => (
                <div key={p.id} className="relative group flex items-center gap-2">
                  <div className="flex-1 min-w-0"><PlayerCard player={p} compact /></div>
                  {!readOnly && (
                    <button type="button" onClick={() => setSwappingPlayerId(p.id)} aria-label={`Swap ${p.name}`} title={`Swap ${p.name}`} className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-500 transition-colors shrink-0">
                      <Repeat size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 py-6 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl bg-gray-50 dark:bg-gray-800/20">
            {court.status === CourtStatus.OPEN ? 'Waiting for assignment...' : 'Needs reset before next match'}
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="p-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-3">
          {court.status === CourtStatus.IN_PROGRESS && match && (
            <div className="flex flex-col w-full gap-2">
              <div className="flex w-full gap-3">
                <button 
                  onClick={() => handleCompleteMatch(Team.A)}
                  className="flex-1 min-h-[44px] bg-gradient-to-r from-blue-500 to-blue-600 hover:scale-[1.02] active:scale-[0.98] text-white rounded-xl text-sm font-semibold transition-transform duration-150 shadow-md shadow-blue-500/20"
                >
                  Team 1 Wins
                </button>
                <button 
                  onClick={() => handleCompleteMatch(Team.B)}
                  className="flex-1 min-h-[44px] bg-gradient-to-r from-rose-500 to-rose-600 hover:scale-[1.02] active:scale-[0.98] text-white rounded-xl text-sm font-semibold transition-transform duration-150 shadow-md shadow-rose-500/20"
                >
                  Team 2 Wins
                </button>
              </div>
              <button
                type="button"
                onClick={() => setShowScoreDialog(true)}
                className="w-full min-h-[38px] rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold transition-colors duration-150"
              >
                Enter Score
              </button>
            </div>
          )}

          {court.status === CourtStatus.OPEN && (
            <div className="flex w-full gap-3">
              <button
                onClick={() => updateCourt({ ...court, status: CourtStatus.NEEDS_RESET })}
                className="flex-1 flex items-center justify-center gap-2 min-h-[44px] bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 rounded-xl text-sm font-medium transition-colors duration-150"
              >
                <AlertCircle size={16} /> Mark Needs Reset
              </button>
              {!match && renderRemoveCourtButton()}
            </div>
          )}

        {court.status === CourtStatus.NEEDS_RESET && (
          <div className="flex w-full gap-3">
              <button
                onClick={() => updateCourt({ ...court, status: CourtStatus.OPEN })}
                className="flex-1 flex items-center justify-center gap-2 min-h-[44px] bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors duration-150 shadow-md"
              >
                <CheckCircle size={16} /> Mark Open
              </button>
              {renderRemoveCourtButton()}
          </div>
        )}
      </div>
      )}

      {swappingPlayerId && match && !readOnly && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setSwappingPlayerId(null)}>
          <div className="bg-white dark:bg-gray-900 rounded-2xl p-5 max-w-sm w-full border border-gray-200 dark:border-gray-800 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Swap Player</h3>
            <p className="text-sm text-gray-500 mb-4">Select an available player to sub in.</p>
            <div className="max-h-64 overflow-y-auto flex flex-col gap-2">
              {availablePlayers.length > 0 ? (
                availablePlayers.map(p => (
                  <button 
                    key={p.id}
                    onClick={() => {
                      const team = match.teamA.includes(swappingPlayerId) ? Team.A : Team.B;
                      swapPlayerInMatch(match.id, team, swappingPlayerId, p.id);
                      setSwappingPlayerId(null);
                    }}
                    className="w-full text-left p-3 rounded-xl bg-gray-50 hover:bg-blue-50 dark:bg-gray-800 dark:hover:bg-blue-900/40 transition-colors border border-transparent hover:border-blue-200 dark:hover:border-blue-800"
                  >
                    <div className="font-bold">{p.name}</div>
                    <div className="text-xs text-gray-500">Skill: {p.skillLevel}</div>
                  </button>
                ))
              ) : (
                <div className="text-center py-8 text-gray-400 text-sm">No available players to swap in.</div>
              )}
            </div>
            <button onClick={() => setSwappingPlayerId(null)} className="w-full mt-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-xl font-semibold transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {showScoreDialog && match && !readOnly && (
        <ScoreDialog
          match={match}
          players={players}
          onSubmit={(winner, scoreA, scoreB) => {
            const winningTeam = winner === Team.A ? teamA : teamB;
            const winningNames = winningTeam.map(p => p.name).join(' and ');
            tts.speak(`Congratulations to ${winningNames} for winning on ${court.label}.`);
            completeMatch(match.id, winner, scoreA, scoreB);
            setShowScoreDialog(false);
          }}
          onClose={() => setShowScoreDialog(false)}
        />
      )}
    </div>
  );
}

export default CourtCard;
