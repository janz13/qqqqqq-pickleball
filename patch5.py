import os

base_dir = r"C:\Users\test\Downloads\QQQQQQ\QQQQQQ\web\src"

def rewrite_file(path, content):
    with open(os.path.join(base_dir, path), "w", encoding="utf-8") as f:
        f.write(content)

roster_panel_content = """'use client';

import { useState, useRef } from 'react';
import { useStore } from '@/lib/store';
import { PlayerStatus, createPlayer, Player } from '@/types/models';
import { PlayerCard } from '@/components/ui/PlayerCard';
import { Plus, Search, Upload } from 'lucide-react';

export default function RosterPanel() {
  const { players, addPlayer, updatePlayer, removePlayer, updatePlayerStatus, roster } = useStore();
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerSkill, setNewPlayerSkill] = useState(3);
  const [checkInNow, setCheckInNow] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'AVAILABLE' | 'PLAYING' | 'RESTING' | 'CHECKED_OUT'>('ALL');
  const [search, setSearch] = useState('');
  const [nameError, setNameError] = useState('');
  
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim()) return;

    if (players.some(p => p.name.toLowerCase() === newPlayerName.trim().toLowerCase())) {
        setNameError('A player with this name already exists');
        return;
    }
    setNameError('');

    addPlayer(createPlayer({
      id: 'p_' + Math.random().toString(36).substr(2, 9),
      name: newPlayerName.trim(),
      skillLevel: newPlayerSkill,
      queuedAtEpochMs: Date.now(),
      joinedSessionAtEpochMs: Date.now(),
      isLatecomer: players.length > 8,
      status: checkInNow ? PlayerStatus.AVAILABLE : PlayerStatus.CHECKED_OUT
    }));
    
    setNewPlayerName('');
  };
  
  const handleLoadFromRoster = (savedPlayer: Player) => {
      if (players.some(p => p.name.toLowerCase() === savedPlayer.name.toLowerCase())) {
          return;
      }
      addPlayer({
          ...savedPlayer,
          id: 'p_' + Math.random().toString(36).substr(2, 9), // new session ID
          status: PlayerStatus.AVAILABLE,
          queuedAtEpochMs: Date.now(),
          joinedSessionAtEpochMs: Date.now(),
          isLatecomer: players.length > 8,
          currentCourtId: null,
          sessionGamesPlayed: 0,
          sessionWins: 0,
          sessionLosses: 0,
          consecutiveSitOuts: 0,
          recentPartnerIds: [],
          recentOpponentIds: [],
          lockedPartnerId: null
      });
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && editingPlayer) {
          const reader = new FileReader();
          reader.onload = (ev) => {
              setEditingPlayer({ ...editingPlayer, photoUrl: ev.target?.result as string });
          };
          reader.readAsDataURL(file);
      }
  };

  const filteredPlayers = players.filter(p => {
    if (filter !== 'ALL' && p.status !== filter as PlayerStatus) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6 animate-slide-up relative">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-6">
            <form onSubmit={handleAddPlayer} className="bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-800 p-6 rounded-2xl flex flex-col gap-4">
              <h2 className="text-xl font-bold tracking-tight">Add Player</h2>
              
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400 ml-1">Name</label>
                <input
                  type="text"
                  value={newPlayerName}
                  onChange={(e) => { setNewPlayerName(e.target.value); setNameError(''); }}
                  placeholder="e.g. John Doe"
                  className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:ring-2 focus:ring-blue-500 outline-none"
                />
                {nameError && <p className="text-sm text-red-500 mt-1">{nameError}</p>}
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-600 dark:text-gray-400 ml-1">Skill Level (1-5)</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(level => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setNewPlayerSkill(level)}
                      className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${
                        newPlayerSkill === level
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                  <input type="checkbox" id="checkInNow" checked={checkInNow} onChange={(e) => setCheckInNow(e.target.checked)} className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
                  <label htmlFor="checkInNow" className="text-sm font-medium text-gray-700 dark:text-gray-300">Check in now</label>
              </div>

              <button
                type="submit"
                disabled={!newPlayerName.trim()}
                className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 flex items-center justify-center gap-2"
              >
                <Plus size={18} /> Add
              </button>
            </form>
            
            {roster.length > 0 && (
                <div className="bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-800 p-6 rounded-2xl flex flex-col gap-4">
                  <h2 className="text-lg font-bold tracking-tight">Load from Roster</h2>
                  <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                      {roster.filter(p => !players.some(cp => cp.name.toLowerCase() === p.name.toLowerCase())).map(saved => (
                          <div key={saved.id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-2 rounded-lg">
                              <span className="font-medium text-sm">{saved.name} (L{saved.skillLevel})</span>
                              <button onClick={() => handleLoadFromRoster(saved)} className="bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 px-3 py-1 rounded-md text-xs font-bold">Add</button>
                          </div>
                      ))}
                      {roster.filter(p => !players.some(cp => cp.name.toLowerCase() === p.name.toLowerCase())).length === 0 && (
                          <div className="text-sm text-gray-500 text-center">All roster players added.</div>
                      )}
                  </div>
                </div>
            )}
        </div>

        <div className="md:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-800 p-2 rounded-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search players..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-transparent border-none focus:ring-0 outline-none text-gray-800 dark:text-gray-100 placeholder:text-gray-400"
              />
            </div>
            <div className="flex gap-1 p-1 bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden flex-wrap">
              {['ALL', 'AVAILABLE', 'PLAYING', 'RESTING', 'CHECKED_OUT'].map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                    filter === f 
                      ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm' 
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {f === 'CHECKED_OUT' ? 'OUT' : f}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredPlayers.length > 0 ? (
              filteredPlayers.map(player => (
                <div key={player.id} className="relative group">
                  <PlayerCard player={player} onClick={() => setEditingPlayer(player)} />
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                    {player.status === PlayerStatus.CHECKED_OUT ? (
                        <button onClick={(e) => { e.stopPropagation(); updatePlayerStatus(player.id, PlayerStatus.AVAILABLE); }} className="text-xs bg-emerald-500 text-white rounded-md py-1 px-2 font-bold shadow-sm">Check In</button>
                    ) : (
                        <select
                          value={player.status}
                          onChange={(e) => updatePlayerStatus(player.id, e.target.value as PlayerStatus)}
                          onClick={e => e.stopPropagation()}
                          className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md py-1 px-2 cursor-pointer shadow-sm outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value={PlayerStatus.AVAILABLE}>Available</option>
                          <option value={PlayerStatus.PLAYING}>Playing</option>
                          <option value={PlayerStatus.RESTING}>Resting</option>
                          <option value={PlayerStatus.CHECKED_OUT}>Out</option>
                        </select>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="col-span-full py-12 text-center text-gray-400 bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-800 rounded-2xl">
                No players found matching your criteria.
              </div>
            )}
          </div>
        </div>
      </div>
      
      {editingPlayer && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-800">
                  <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-gray-100">Edit Player</h2>
                  <div className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                          <input type="text" value={editingPlayer.name} onChange={e => setEditingPlayer({...editingPlayer, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                      
                      <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Skill Level</label>
                          <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map(level => (
                              <button
                                key={level}
                                type="button"
                                onClick={() => setEditingPlayer({...editingPlayer, skillLevel: level})}
                                className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all duration-200 ${
                                  editingPlayer.skillLevel === level
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400'
                                }`}
                              >
                                {level}
                              </button>
                            ))}
                          </div>
                      </div>
                      
                      <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">DUPR URL</label>
                          <input type="url" value={editingPlayer.duprProfileUrl || ''} onChange={e => setEditingPlayer({...editingPlayer, duprProfileUrl: e.target.value})} placeholder="https://mydupr.com/..." className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                      
                      <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                          <select value={editingPlayer.status} onChange={e => setEditingPlayer({...editingPlayer, status: e.target.value as PlayerStatus})} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none">
                              <option value={PlayerStatus.AVAILABLE}>Available</option>
                              <option value={PlayerStatus.PLAYING}>Playing</option>
                              <option value={PlayerStatus.RESTING}>Resting</option>
                              <option value={PlayerStatus.CHECKED_OUT}>Checked Out (Pre-registered)</option>
                          </select>
                      </div>
                      
                      <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Photo</label>
                          <div className="flex items-center gap-3">
                              {editingPlayer.photoUrl && <img src={editingPlayer.photoUrl} alt="Preview" className="w-10 h-10 rounded-full object-cover" />}
                              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors">
                                  <Upload size={16} /> Upload Photo
                              </button>
                              <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} accept="image/*" className="hidden" />
                          </div>
                      </div>
                      
                  </div>
                  <div className="mt-6 flex gap-3 justify-end">
                      <button onClick={() => setEditingPlayer(null)} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-lg font-medium">Cancel</button>
                      <button onClick={() => { updatePlayer(editingPlayer); setEditingPlayer(null); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">Save Changes</button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}
"""
rewrite_file(r"components/dashboard/RosterPanel.tsx", roster_panel_content)

courts_panel_content = """'use client';

import { useStore } from '@/lib/store';
import { CourtStatus, PlayerStatus } from '@/types/models';
import { CourtCard } from '@/components/ui/CourtCard';
import { PlayerCard } from '@/components/ui/PlayerCard';
import { PlusCircle, Play, Users } from 'lucide-react';

export default function CourtsPanel() {
  const { courts, players, getUpcomingBatches, startBatch, addCourt } = useStore();

  const activeCourtsCount = courts.filter(c => c.status === CourtStatus.IN_PROGRESS).length;
  const openCourtsCount = courts.filter(c => c.status === CourtStatus.OPEN).length;

  const queuedPlayers = players
    .filter(p => p.status === PlayerStatus.AVAILABLE || p.status === PlayerStatus.QUEUED)
    .sort((a, b) => {
      if (a.isLatecomer !== b.isLatecomer) return a.isLatecomer ? -1 : 1;
      return a.queuedAtEpochMs - b.queuedAtEpochMs;
    });

  const upcomingBatches = getUpcomingBatches();

  const handleAddCourt = () => {
    addCourt({
      id: 'c_' + Math.random().toString(36).substr(2, 9),
      label: `Court ${courts.length + 1}`, // Will be overwritten in store correctly
      status: CourtStatus.OPEN,
      currentMatchId: null
    });
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

      {upcomingBatches.length > 0 && (
        <div className="bg-white dark:bg-gray-900 shadow-sm border border-emerald-200 dark:border-emerald-800/30 p-6 rounded-2xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse-soft" />
            <h2 className="text-xl font-bold tracking-tight text-emerald-800 dark:text-emerald-400">Next Matches Ready</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {upcomingBatches.map((batch, idx) => {
              const availableCourts = courts.filter(c => c.status === CourtStatus.OPEN);
              const targetCourt = availableCourts[idx];
              
              return (
                <div key={idx} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl flex flex-col gap-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Match {idx + 1}</span>
                    <span className="text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded-md text-gray-600 dark:text-gray-300 font-medium">{targetCourt?.label || 'No court'}</span>
                  </div>
                  
                  <div className="space-y-1">
                    {batch.teamA.map(p => <PlayerCard key={p.id} player={p} compact />)}
                  </div>
                  <div className="text-center text-xs font-bold text-gray-400">VS</div>
                  <div className="space-y-1">
                    {batch.teamB.map(p => <PlayerCard key={p.id} player={p} compact />)}
                  </div>
                  
                  {targetCourt && (
                    <button
                      onClick={() => startBatch(batch, targetCourt.id)}
                      className="mt-2 w-full flex items-center justify-center gap-2 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold shadow-sm transition-all duration-200 hover:scale-[1.02]"
                    >
                      <Play size={16} /> Send to Court
                    </button>
                  )}
                </div>
              );
            })}
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
    </div>
  );
}
"""
rewrite_file(r"components/dashboard/CourtsPanel.tsx", courts_panel_content)
