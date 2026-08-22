'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '@/lib/store';
import { PlayerStatus, createPlayer, Player } from '@/types/models';
import { PlayerCard } from '@/components/ui/PlayerCard';
import { Plus, Search, Upload, Download, FileUp } from 'lucide-react';

/* eslint-disable @next/next/no-img-element */
/* eslint-disable react-hooks/purity */
 

export default function RosterPanel() {
  const { players, addPlayer, updatePlayer, updatePlayerStatus, roster, setLockedPartner, unlockPartner } = useStore();
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerSkill, setNewPlayerSkill] = useState(3);
  const [checkInNow, setCheckInNow] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'AVAILABLE' | 'PLAYING' | 'RESTING' | 'CHECKED_OUT'>('ALL');
  const [search, setSearch] = useState('');
  const [nameError, setNameError] = useState('');
  
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = () => {
    const csvContent = "Name,Skill Level\nJohn Doe,3.5\nJane Smith,4.0";
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Roster_Template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const lines = text.split('\n');
      lines.slice(1).forEach(line => {
        const [name, skill] = line.split(',');
        if (name && name.trim()) {
          const cleanName = name.trim();
          if (!players.some(p => p.name.toLowerCase() === cleanName.toLowerCase())) {
            const skillLevel = skill ? parseFloat(skill.trim()) : 3;
            addPlayer(createPlayer({
              id: 'p_' + Math.random().toString(36).substr(2, 9),
              name: cleanName,
              skillLevel: isNaN(skillLevel) ? 3 : skillLevel,
              queuedAtEpochMs: Date.now() - (Math.random() * 60000), // Randomize within the last minute so they enter the queue in a scrambled order
              joinedSessionAtEpochMs: Date.now(),
              isLatecomer: false,
              status: PlayerStatus.AVAILABLE
            }));
          }
        }
      });
      if (csvInputRef.current) csvInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

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
  
  const generateId = () => 'p_' + Math.random().toString(36).substr(2, 9);
  const getNow = () => Date.now();

  const handleLoadFromRoster = (savedPlayer: Player) => {
      if (players.some(p => p.name.toLowerCase() === savedPlayer.name.toLowerCase())) {
          return;
      }
      addPlayer({
          ...savedPlayer,
          id: generateId(), // new session ID
          status: PlayerStatus.AVAILABLE,
          queuedAtEpochMs: getNow(),
          joinedSessionAtEpochMs: getNow(),
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
              const img = new Image();
              img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 150;
                const MAX_HEIGHT = 150;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                  if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                  }
                } else {
                  if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                  }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7); // 70% quality JPEG
                setEditingPlayer({ ...editingPlayer, photoUrl: dataUrl });
              };
              img.src = ev.target?.result as string;
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

            <div className="bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-800 p-6 rounded-2xl flex flex-col gap-4">
              <h2 className="text-lg font-bold tracking-tight">Bulk Import</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => csvInputRef.current?.click()}
                  className="flex-1 py-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <FileUp size={16} /> Import CSV
                </button>
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  ref={csvInputRef}
                  onChange={handleCsvImport}
                />
                <button
                  onClick={handleDownloadTemplate}
                  className="flex-1 py-2 bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  <Download size={16} /> Template
                </button>
              </div>
            </div>
            
            {roster.length > 0 && (
                <div className="bg-white dark:bg-gray-900 shadow-sm border border-gray-200 dark:border-gray-800 p-6 rounded-2xl flex flex-col gap-4">
                  <h2 className="text-lg font-bold tracking-tight">Load from Roster</h2>
                  <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                      {roster.filter(p => !players.some(cp => cp.name.toLowerCase() === p.name.toLowerCase())).map(saved => (
                          <div key={saved.id} className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-2 rounded-lg">
                              <span className="font-medium text-sm">{saved.name} (L{saved.skillLevel})</span>
                              <button onClick={() => handleLoadFromRoster(saved)} className="bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 px-3 py-1 rounded-md text-xs font-bold transition-colors">Add</button>
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
                  onClick={() => setFilter(f as 'ALL' | 'AVAILABLE' | 'PLAYING' | 'RESTING' | 'CHECKED_OUT')}
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
      
      {editingPlayer && typeof document !== 'undefined' && createPortal(
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
              <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-sm w-full p-5 border shadow-xl">
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
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-2">Locked Partner <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded uppercase font-bold">Duo Queue</span></label>
                          <select 
                            value={editingPlayer.lockedPartnerId || ''} 
                            onChange={e => setEditingPlayer({...editingPlayer, lockedPartnerId: e.target.value === '' ? null : e.target.value})} 
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-blue-500 outline-none"
                          >
                              <option value="">None (Solo)</option>
                              {players.filter(p => p.id !== editingPlayer.id).map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
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
                      <button 
                        onClick={() => { 
                          updatePlayer(editingPlayer); 
                          setEditingPlayer(null); 
                        }} 
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                      >
                        Save Changes
                      </button>
                  </div>
              </div>
          </div>,
          document.body
      )}
    </div>
  );
}
