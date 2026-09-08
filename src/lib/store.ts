import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Player, Court, Match, Session, PlayerStatus, Team, ProposedMatch, CourtStatus, createPlayer } from '@/types/models';
import { buildNextBatches, incrementSitOuts } from '@/engine/queue-engine';
import { pairFour } from '@/engine/pairing-engine';

interface StoreState {
  currentUser: { email: string; id: string } | null;
  setCurrentUser: (user: { email: string; id: string } | null) => void;
  
  sessionId: string | null;
  joinCode: string | null;
  players: Player[];
  courts: Court[];
  matches: Match[];
  session: Session | null;
  
  roster: Player[];
  rostersByOwner: Record<string, Player[]>;
  
  setSession: (session: Session | null) => void;
  updateSession: (sessionId: string, updates: Partial<Session>) => void;
  setPlayers: (players: Player[]) => void;
  setCourts: (courts: Court[]) => void;
  setMatches: (matches: Match[]) => void;
  
  addPlayer: (player: Player) => void;
  updatePlayer: (player: Player) => void;
  removePlayer: (id: string) => void;
  
  saveToRoster: (player: Player) => void;
  clearRoster: () => void;
  
  addCourt: (court: Court) => void;
  updateCourt: (court: Court) => void;
  removeCourt: (id: string) => void;

  addMatch: (match: Match) => void;
  completeMatch: (matchId: string, winner: Team, scoreA: number, scoreB: number) => void;
  startBatch: (batch: ProposedMatch, courtId: string) => void;
  updatePlayerStatus: (playerId: string, status: PlayerStatus) => void;
  setLockedPartner: (playerAId: string, playerBId: string) => void;
  unlockPartner: (playerId: string) => void;
  updatePlayerSkill: (playerId: string, skillLevel: number) => void;
  sessionHistory: {session: Session, players: Player[], courts: Court[], matches: Match[], endedAtEpochMs: number}[];
  endSession: () => void;
  clearHistory: () => void;
  initializeSession: (name: string, courtsCount: number) => Session;
  swapPlayerInMatch: (matchId: string, team: Team, oldPlayerId: string, newPlayerId: string) => void;
  reverseMatchWinner: (matchId: string) => void;
  syncCloudRoster: (userId?: string) => Promise<void>;
  
  getUpcomingBatches: () => ProposedMatch[];
  broadcastAnnouncement: (text: string) => void;
  ttsEnabled: boolean;
  ttsVoice: string | null;
  ttsRate: number;
  setTTSEnabled: (enabled: boolean) => void;
  setTTSVoice: (voice: string | null) => void;
  setTTSRate: (rate: number) => void;
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      setCurrentUser: (user) => {
        set(state => {
          const newRosters = { ...(state.rostersByOwner || {}) };
          
          // Save current roster to the outgoing user
          if (state.currentUser && !state.currentUser.id.startsWith('guest_')) {
            newRosters[state.currentUser.id] = state.roster;
          } else if (state.roster.length > 0 && !state.currentUser) {
            // Migration: if they had a roster before this feature, and log in, keep it for them
            if (user && !user.id.startsWith('guest_')) {
               newRosters[user.id] = state.roster;
            }
          }

          let nextRoster: Player[] = [];
          if (user && !user.id.startsWith('guest_')) {
             nextRoster = newRosters[user.id] || (state.roster.length > 0 && !state.currentUser ? state.roster : []);
          }

          const isDifferentOwner = state.session && state.session.ownerUid !== user?.id;
          return { 
            currentUser: user,
            rostersByOwner: newRosters,
            roster: nextRoster,
            ...(isDifferentOwner ? {
              session: null,
              sessionId: null,
              joinCode: null,
              players: [],
              courts: [],
              matches: []
            } : {})
          };
        });

        if (user && !user.id.startsWith('guest_')) {
          get().syncCloudRoster(user.id);
        }
      },

      sessionId: null,
      joinCode: null,
      players: [],
      courts: [],
      matches: [],
      session: null,
      sessionHistory: [],
      roster: [],
      rostersByOwner: {},
      
      ttsEnabled: false,
      ttsVoice: null,
      ttsRate: 1.0,
      setTTSEnabled: (enabled) => set({ ttsEnabled: enabled }),
      setTTSVoice: (voice) => set({ ttsVoice: voice }),
      setTTSRate: (rate) => set({ ttsRate: rate }),
      
      setSession: (session) => set({ session, sessionId: session?.id ?? null, joinCode: session?.joinCode ?? null }),
      updateSession: (sessionId, updates) => set(state => {
        if (state.session?.id === sessionId) {
          return { session: { ...state.session, ...updates } };
        }
        return state;
      }),
      setPlayers: (players) => set({ players }),
      setCourts: (courts) => set({ courts }),
      setMatches: (matches) => set({ matches }),
      
      addPlayer: (player) => {
        set((state) => ({ players: [...state.players, player] }));
        get().saveToRoster(player);
      },
      updatePlayer: (player) => {
        set((state) => {
          // If player has a new lock, we must handle bidirectional logic atomically
          const oldPlayer = state.players.find(p => p.id === player.id);
          const oldPartnerId = oldPlayer?.lockedPartnerId;
          const newPartnerId = player.lockedPartnerId;

          let newPlayers = [...state.players];

          // 1. Break old locks if changed
          if (oldPartnerId && oldPartnerId !== newPartnerId) {
            newPlayers = newPlayers.map(p => 
              p.id === oldPartnerId ? { ...p, lockedPartnerId: null } : p
            );
          }

          // 2. Break new partner's old lock if changed
          if (newPartnerId && oldPartnerId !== newPartnerId) {
             const newPartner = newPlayers.find(p => p.id === newPartnerId);
             if (newPartner?.lockedPartnerId) {
                newPlayers = newPlayers.map(p => 
                  p.id === newPartner.lockedPartnerId ? { ...p, lockedPartnerId: null } : p
                );
             }
             // Establish bidirectional
             newPlayers = newPlayers.map(p => 
                p.id === newPartnerId ? { ...p, lockedPartnerId: player.id } : p
             );
          }

          // 3. Update the player itself
          newPlayers = newPlayers.map(p => p.id === player.id ? player : p);

          return { players: newPlayers };
        });
        get().saveToRoster(player);
      },
      removePlayer: (id) => set((state) => ({ players: state.players.filter(p => p.id !== id) })),
      
      saveToRoster: (player) => set((state) => {
        const existing = state.roster.find(p => p.name.toLowerCase() === player.name.toLowerCase());
        let newRoster: Player[];
        
        if (existing) {
          // If the player exists, we merge, BUT we MUST preserve all-time stats!
          // Quick Add passes a new player object with 0s for all-time stats.
          newRoster = state.roster.map(p => p.id === existing.id ? { 
            ...player, // Take new properties (like skill level update)
            id: p.id,  // Keep original ID
            allTimeWins: Math.max(p.allTimeWins, player.allTimeWins),
            allTimeLosses: Math.max(p.allTimeLosses, player.allTimeLosses),
            allTimeGamesPlayed: Math.max(p.allTimeGamesPlayed, player.allTimeGamesPlayed),
            allTimeSessionsPlayed: Math.max(p.allTimeSessionsPlayed, player.allTimeSessionsPlayed)
          } : p);
        } else {
          newRoster = [...state.roster, player];
        }
        
        if (state.currentUser && !state.currentUser.id.startsWith('guest_')) {
          return { 
            roster: newRoster, 
            rostersByOwner: { ...(state.rostersByOwner || {}), [state.currentUser.id]: newRoster } 
          };
        }
        return { roster: newRoster };
      }),
      clearRoster: () => set((state) => {
        if (state.currentUser && !state.currentUser.id.startsWith('guest_')) {
          return { roster: [], rostersByOwner: { ...(state.rostersByOwner || {}), [state.currentUser.id]: [] } };
        }
        return { roster: [] };
      }),
      
      addCourt: (court) => set((state) => {
        const maxCourtNum = state.courts.reduce((max, c) => {
          const m = c.label.match(/Court (\d+)/);
          return m ? Math.max(max, parseInt(m[1], 10)) : max;
        }, 0);
        return { courts: [...state.courts, { ...court, label: `Court ${maxCourtNum + 1}` }] };
      }),
      updateCourt: (court) => set((state) => ({ courts: state.courts.map(c => c.id === court.id ? court : c) })),
      removeCourt: (id) => set((state) => {
        const court = state.courts.find(c => c.id === id);
        if (court && court.currentMatchId) {
            const match = state.matches.find(m => m.id === court.currentMatchId);
            if (match) {
               const matchPlayers = new Set([...match.teamA, ...match.teamB]);
               const newPlayers = state.players.map(p => {
                 if (matchPlayers.has(p.id)) {
                   return { ...p, status: PlayerStatus.AVAILABLE, currentCourtId: null };
                 }
                 return p;
               });
               return {
                 courts: state.courts.filter(c => c.id !== id),
                 players: newPlayers,
                 matches: state.matches.filter(m => m.id !== match.id)
               };
            }
        }
        return { courts: state.courts.filter(c => c.id !== id) };
      }),

      addMatch: (match) => set((state) => ({ matches: [...state.matches, match] })),
      
      completeMatch: (matchId, winner, scoreA, scoreB) => set((state) => {
        const match = state.matches.find(m => m.id === matchId);
        if (!match) return state;

        const newMatches = state.matches.map(m => 
          m.id === matchId 
            ? { ...m, endedAtEpochMs: Date.now(), winner, scoreA, scoreB } 
            : m
        );

        const matchPlayers = new Set([...match.teamA, ...match.teamB]);

        const newPlayers = state.players.map(p => {
          if (matchPlayers.has(p.id)) {
            const isTeamA = match.teamA.includes(p.id);
            const won = (isTeamA && winner === Team.A) || (!isTeamA && winner === Team.B);
            
            const partner = isTeamA ? match.teamA.find(id => id !== p.id) : match.teamB.find(id => id !== p.id);
            const recentPartners = partner 
                ? [partner, ...p.recentPartnerIds].slice(0, 3) 
                : p.recentPartnerIds;

            const opponents = isTeamA ? match.teamB : match.teamA;
            const recentOpponents = [...opponents, ...p.recentOpponentIds].slice(0, 6);

            return {
              ...p,
              status: PlayerStatus.AVAILABLE,
              currentCourtId: null,
              sessionGamesPlayed: p.sessionGamesPlayed + 1,
              allTimeGamesPlayed: p.allTimeGamesPlayed + 1,
              sessionWins: p.sessionWins + (won ? 1 : 0),
              allTimeWins: p.allTimeWins + (won ? 1 : 0),
              sessionLosses: p.sessionLosses + (!won ? 1 : 0),
              allTimeLosses: p.allTimeLosses + (!won ? 1 : 0),
              recentPartnerIds: recentPartners,
              recentOpponentIds: recentOpponents,
              lastMatchResult: (won ? 'won' : 'lost') as 'won' | 'lost',
              consecutiveSitOuts: 0
            };
          }
          return p;
        });

        const updatedPlayersWithSitouts = incrementSitOuts(newPlayers, matchPlayers);

        const newCourts = state.courts.map(c => 
          c.id === match.courtId 
            ? { ...c, status: CourtStatus.OPEN, currentMatchId: null } 
            : c
        );

        // Update roster with new all-time stats
        const newRoster = [...state.roster];
        updatedPlayersWithSitouts.forEach(p => {
           if (matchPlayers.has(p.id)) {
              const rosterIdx = newRoster.findIndex(r => r.name.toLowerCase() === p.name.toLowerCase());
              if (rosterIdx >= 0) {
                 newRoster[rosterIdx] = { 
                   ...newRoster[rosterIdx], 
                   allTimeGamesPlayed: p.allTimeGamesPlayed,
                   allTimeWins: p.allTimeWins,
                   allTimeLosses: p.allTimeLosses
                 };
              } else {
                 newRoster.push(p);
              }
           }
        });

        const updates: Partial<StoreState> = { 
          matches: newMatches, 
          players: updatedPlayersWithSitouts, 
          courts: newCourts, 
          roster: newRoster 
        };

        if (state.currentUser && !state.currentUser.id.startsWith('guest_')) {
          updates.rostersByOwner = {
            ...(state.rostersByOwner || {}),
            [state.currentUser.id]: newRoster
          };
        }

        return updates;
      }),

      startBatch: (batch, courtId) => set((state) => {
        const matchId = 'm_' + Math.random().toString(36).substr(2, 9);
        const newMatch: Match = {
          id: matchId,
          courtId,
          teamA: batch.teamA.map(p => p.id),
          teamB: batch.teamB.map(p => p.id),
          startedAtEpochMs: Date.now(),
          endedAtEpochMs: null,
          winner: null,
          scoreA: null,
          scoreB: null
        };

        const matchPlayers = new Set([...newMatch.teamA, ...newMatch.teamB]);

        const newPlayers = state.players.map(p => {
          if (matchPlayers.has(p.id)) {
            return {
              ...p,
              status: PlayerStatus.PLAYING,
              currentCourtId: courtId
            };
          }
          return p;
        });

        const newCourts = state.courts.map(c => 
          c.id === courtId 
            ? { ...c, status: CourtStatus.IN_PROGRESS, currentMatchId: matchId } 
            : c
        );

        return {
          matches: [...state.matches, newMatch],
          players: newPlayers,
          courts: newCourts
        };
      }),

      updatePlayerStatus: (playerId, status) => set((state) => ({
        players: state.players.map(p => 
          p.id === playerId ? { ...p, status, queuedAtEpochMs: status === PlayerStatus.AVAILABLE ? Date.now() : p.queuedAtEpochMs } : p
        )
      })),

      setLockedPartner: (playerAId, playerBId) => set((state) => ({
        players: state.players.map(p => {
          if (p.id === playerAId) return { ...p, lockedPartnerId: playerBId };
          if (p.id === playerBId) return { ...p, lockedPartnerId: playerAId };
          return p;
        })
      })),

      unlockPartner: (playerId) => set((state) => {
        const player = state.players.find(p => p.id === playerId);
        if (!player) return state;
        const partnerId = player.lockedPartnerId;
        return {
          players: state.players.map(p => {
            if (p.id === playerId || p.id === partnerId) return { ...p, lockedPartnerId: null };
            return p;
          })
        };
      }),

      updatePlayerSkill: (playerId, skillLevel) => set((state) => ({
        players: state.players.map(p => p.id === playerId ? { ...p, skillLevel } : p)
      })),

      endSession: () => {
        const state = get();
        if (!state.session) return;

        // Force an immediate cloud update to broadcast that the session has ended
        if (typeof window !== 'undefined' && state.currentUser) {
          try {
            import('./supabase').then(({ createClient }) => {
              const supabase = createClient();
              if (supabase) {
                 const sanitizePlayers = (players: Player[]) => players.map(p => ({ ...p, photoUrl: undefined }));
                 const finalState = {
                   players: sanitizePlayers(state.players),
                   courts: state.courts,
                   matches: state.matches,
                   session: { ...state.session, isActive: false },
                   endedAtEpochMs: Date.now()
                 };
                 supabase.from('sessions').update({ 
                   is_active: false,
                   state_json: finalState,
                   updated_at: new Date().toISOString()
                 }).eq('id', state.session!.id).then(() => {
                   if (state.currentUser && !state.currentUser.id.startsWith('guest_')) {
                     get().syncCloudRoster(state.currentUser.id);
                   }
                 });
              }
            }).catch(e => console.error("Failed to load supabase", e));
          } catch (e) {
            console.error("Failed to broadcast session end", e);
          }
        }

        set((state) => {
          if (!state.session) return state;
          const historyItem = {
            session: state.session,
            players: state.players,
            courts: state.courts,
            matches: state.matches,
            endedAtEpochMs: Date.now()
          };
          const newHistory = [...state.sessionHistory, historyItem].slice(-50);
          return {
            sessionHistory: newHistory,
            session: null,
            sessionId: null,
            joinCode: null,
            players: [],
            courts: [],
            matches: []
          };
        });
      },

      clearHistory: () => set({ sessionHistory: [] }),

      initializeSession: (name, courtsCount) => {
        const state = get();
        const sessionId = 's_' + Date.now().toString(36);
        const joinCode = Math.random().toString(36).substring(2, 7).toUpperCase();
        
        const newSession: Session = {
          id: sessionId,
          joinCode,
          name,
          ownerUid: state.currentUser?.id || 'guest',
          createdAtEpochMs: Date.now(),
          isActive: true,
          courtsPerBatch: courtsCount,
          queueBatchesShown: 2,
          showNextUpToPlayers: true
        };

        const initialCourts: Court[] = Array.from({ length: courtsCount }).map((_, i) => ({
          id: `c_${i + 1}`,
          label: `Court ${i + 1}`,
          status: CourtStatus.OPEN,
          currentMatchId: null
        }));

        set({
          session: newSession,
          sessionId,
          joinCode,
          courts: initialCourts,
          players: [],
          matches: [],
          roster: state.currentUser ? state.roster : [] // Only keep roster for logged in users
        });

        return newSession;
      },

      swapPlayerInMatch: (matchId, oldPlayerId, newPlayerId) => set((state) => {
        const match = state.matches.find(m => m.id === matchId);
        if (!match) return state;
        
        const newMatches = state.matches.map(m => {
          if (m.id === matchId) {
            return {
              ...m,
              teamA: m.teamA.map(id => id === oldPlayerId ? newPlayerId : id),
              teamB: m.teamB.map(id => id === oldPlayerId ? newPlayerId : id)
            };
          }
          return m;
        });
        
        const newPlayers = state.players.map(p => {
          if (p.id === oldPlayerId) {
            return { ...p, status: PlayerStatus.AVAILABLE, currentCourtId: null };
          }
          if (p.id === newPlayerId) {
            return { ...p, status: PlayerStatus.PLAYING, currentCourtId: match.courtId };
          }
          return p;
        });
        
        return { matches: newMatches, players: newPlayers };
      }),

      reverseMatchWinner: (matchId: string) => set((state) => {
        const match = state.matches.find(m => m.id === matchId);
        if (!match || !match.winner) return state;

        const oldWinner = match.winner;
        const newWinner = oldWinner === Team.A ? Team.B : Team.A;

        const newMatches = state.matches.map(m => 
          m.id === matchId 
            ? { ...m, winner: newWinner } 
            : m
        );

        const matchPlayers = new Set([...match.teamA, ...match.teamB]);

        const newPlayers = state.players.map(p => {
          if (matchPlayers.has(p.id)) {
            const wasOnOldWinningTeam = (match.teamA.includes(p.id) && oldWinner === Team.A) ||
                                       (match.teamB.includes(p.id) && oldWinner === Team.B);

            const winDelta = wasOnOldWinningTeam ? -1 : 1;
            const lossDelta = wasOnOldWinningTeam ? 1 : -1;

            return {
              ...p,
              sessionWins: Math.max(0, p.sessionWins + winDelta),
              allTimeWins: Math.max(0, p.allTimeWins + winDelta),
              sessionLosses: Math.max(0, p.sessionLosses + lossDelta),
              allTimeLosses: Math.max(0, p.allTimeLosses + lossDelta),
            };
          }
          return p;
        });

        // Update roster with new all-time stats
        const newRoster = [...state.roster];
        newPlayers.forEach(p => {
          if (matchPlayers.has(p.id)) {
            const rosterIdx = newRoster.findIndex(r => r.name.toLowerCase() === p.name.toLowerCase());
            if (rosterIdx >= 0) {
              newRoster[rosterIdx] = { 
                ...newRoster[rosterIdx], 
                allTimeWins: p.allTimeWins,
                allTimeLosses: p.allTimeLosses
              };
            } else {
              newRoster.push(p);
            }
          }
        });

        const updates: Partial<StoreState> = {
          matches: newMatches,
          players: newPlayers,
          roster: newRoster
        };

        if (state.currentUser && !state.currentUser.id.startsWith('guest_')) {
          updates.rostersByOwner = {
            ...(state.rostersByOwner || {}),
            [state.currentUser.id]: newRoster
          };
        }

        return updates;
      }),

      syncCloudRoster: async (userId?: string) => {
        const uid = userId || get().currentUser?.id;
        if (!uid || uid.startsWith('guest_')) return;

        try {
          const { createClient } = await import('./supabase');
          const supabase = createClient();
          if (!supabase) return;

          const { data, error } = await supabase
            .from('sessions')
            .select('id, is_active, state_json, updated_at')
            .eq('owner_uid', uid)
            .order('updated_at', { ascending: true });

          if (error || !data) {
            console.error('Failed to fetch sessions for cloud roster sync:', error);
            return;
          }

          const playerMap = new Map<string, {
            name: string;
            skillLevel: number;
            duprProfileUrl?: string | null;
            photoUrl?: string | null;
            allTimeWins: number;
            allTimeLosses: number;
            allTimeGamesPlayed: number;
            allTimeSessionsPlayed: number;
            lastSeenEpochMs: number;
          }>();

          for (const row of data) {
            const state = row.state_json;
            if (!state || !Array.isArray(state.players)) continue;

            const sessionPlayers = state.players as Player[];
            const sessionMatches = Array.isArray(state.matches) ? (state.matches as Match[]) : [];
            const updatedAtMs = row.updated_at ? new Date(row.updated_at).getTime() : Date.now();

            const matchWinsByPlayer = new Map<string, number>();
            const matchLossesByPlayer = new Map<string, number>();

            sessionMatches.forEach(m => {
              if (m.endedAtEpochMs && m.winner) {
                const winners = m.winner === Team.A ? m.teamA : m.teamB;
                const losers = m.winner === Team.A ? m.teamB : m.teamA;
                winners.forEach(id => matchWinsByPlayer.set(id, (matchWinsByPlayer.get(id) || 0) + 1));
                losers.forEach(id => matchLossesByPlayer.set(id, (matchLossesByPlayer.get(id) || 0) + 1));
              }
            });

            for (const sp of sessionPlayers) {
              const key = sp.name.trim().toLowerCase();
              if (!key) continue;

              const winsFromMatches = matchWinsByPlayer.get(sp.id);
              const lossesFromMatches = matchLossesByPlayer.get(sp.id);
              const wins = winsFromMatches !== undefined ? winsFromMatches : (sp.sessionWins || 0);
              const losses = lossesFromMatches !== undefined ? lossesFromMatches : (sp.sessionLosses || 0);
              const games = sp.sessionGamesPlayed || (wins + losses);

              const existing = playerMap.get(key);
              if (!existing) {
                playerMap.set(key, {
                  name: sp.name.trim(),
                  skillLevel: sp.skillLevel || 3,
                  duprProfileUrl: sp.duprProfileUrl ?? null,
                  photoUrl: sp.photoUrl ?? null,
                  allTimeWins: wins,
                  allTimeLosses: losses,
                  allTimeGamesPlayed: games,
                  allTimeSessionsPlayed: 1,
                  lastSeenEpochMs: updatedAtMs
                });
              } else {
                existing.allTimeWins += wins;
                existing.allTimeLosses += losses;
                existing.allTimeGamesPlayed += games;
                existing.allTimeSessionsPlayed += 1;
                if (updatedAtMs >= existing.lastSeenEpochMs) {
                  existing.skillLevel = sp.skillLevel || existing.skillLevel;
                  existing.name = sp.name.trim();
                  if (sp.duprProfileUrl !== undefined) existing.duprProfileUrl = sp.duprProfileUrl;
                  if (sp.photoUrl !== undefined) existing.photoUrl = sp.photoUrl;
                  existing.lastSeenEpochMs = updatedAtMs;
                }
              }
            }
          }

          const aggregatedRoster: Player[] = Array.from(playerMap.values()).map(p => createPlayer({
            id: 'r_' + Math.random().toString(36).substr(2, 9),
            name: p.name,
            skillLevel: p.skillLevel,
            status: PlayerStatus.AVAILABLE,
            queuedAtEpochMs: Date.now(),
            joinedSessionAtEpochMs: Date.now(),
            isLatecomer: false,
            currentCourtId: null,
            sessionGamesPlayed: 0,
            sessionWins: 0,
            sessionLosses: 0,
            allTimeGamesPlayed: p.allTimeGamesPlayed,
            allTimeWins: p.allTimeWins,
            allTimeLosses: p.allTimeLosses,
            allTimeSessionsPlayed: p.allTimeSessionsPlayed,
            consecutiveSitOuts: 0,
            recentPartnerIds: [],
            recentOpponentIds: [],
            lockedPartnerId: null,
            duprProfileUrl: p.duprProfileUrl ?? null,
            photoUrl: p.photoUrl ?? null
          }));

          const currentRoster = get().roster;
          const mergedRoster: Player[] = [...aggregatedRoster];

          for (const localPlayer of currentRoster) {
            const matchIdx = mergedRoster.findIndex(
              r => r.name.toLowerCase() === localPlayer.name.toLowerCase()
            );
            if (matchIdx >= 0) {
              mergedRoster[matchIdx] = {
                ...mergedRoster[matchIdx],
                allTimeWins: Math.max(mergedRoster[matchIdx].allTimeWins, localPlayer.allTimeWins),
                allTimeLosses: Math.max(mergedRoster[matchIdx].allTimeLosses, localPlayer.allTimeLosses),
                allTimeGamesPlayed: Math.max(mergedRoster[matchIdx].allTimeGamesPlayed, localPlayer.allTimeGamesPlayed),
                allTimeSessionsPlayed: Math.max(mergedRoster[matchIdx].allTimeSessionsPlayed, localPlayer.allTimeSessionsPlayed),
                photoUrl: localPlayer.photoUrl || mergedRoster[matchIdx].photoUrl,
                duprProfileUrl: localPlayer.duprProfileUrl || mergedRoster[matchIdx].duprProfileUrl
              };
            } else {
              mergedRoster.push(localPlayer);
            }
          }

          set(state => ({
            roster: mergedRoster,
            rostersByOwner: {
              ...(state.rostersByOwner || {}),
              [uid]: mergedRoster
            }
          }));
        } catch (err) {
          console.error('Error in syncCloudRoster:', err);
        }
      },

      getUpcomingBatches: () => {
        const state = get();
        const openCourts = state.courts.filter(c => c.status === CourtStatus.OPEN).length;
        if (openCourts === 0) return [];

        const mode = state.session?.matchingMode || 'balanced';
        const batches = buildNextBatches(state.players, openCourts, mode);
        return batches.map(b => pairFour(b));
      },

      broadcastAnnouncement: (text: string) => set((state) => {
        if (!state.session) return state;
        return {
          session: {
            ...state.session,
            currentAnnouncement: text,
            announcementTimestamp: Date.now()
          }
        };
      })
    }),
    {
      name: 'pickleball-storage',
      partialize: (state) => {
        // To prevent QuotaExceededError, we strip the giant base64 photoUrls from EVERYTHING
        const sanitizePlayers = (players: Player[]) => players.map(p => ({ ...p, photoUrl: undefined }));
        
        const historySansPhotos = state.sessionHistory ? state.sessionHistory.map(h => ({
          ...h,
          players: sanitizePlayers(h.players)
        })).slice(-50) : [];

        return {
          ...state,
          players: sanitizePlayers(state.players),
          sessionHistory: historySansPhotos
        };
      },
      merge: (persistedState: any, currentState: StoreState) => {
        // CRITICAL FIX for court glitch:
        // If the current in-memory state already has a session loaded (e.g. from cloud fetch),
        // do NOT let localStorage overwrite the live session data (players, courts, matches).
        // Only merge non-session fields like roster, rostersByOwner, currentUser, tts settings, etc.
        if (currentState.session && currentState.players.length > 0) {
          return {
            ...currentState,
            // Only restore these non-session fields from localStorage:
            currentUser: persistedState?.currentUser ?? currentState.currentUser,
            roster: persistedState?.roster ?? currentState.roster,
            rostersByOwner: persistedState?.rostersByOwner ?? currentState.rostersByOwner,
            sessionHistory: persistedState?.sessionHistory ?? currentState.sessionHistory,
            ttsEnabled: persistedState?.ttsEnabled ?? currentState.ttsEnabled,
            ttsVoice: persistedState?.ttsVoice ?? currentState.ttsVoice,
            ttsRate: persistedState?.ttsRate ?? currentState.ttsRate,
          };
        }
        // Normal merge for organizer — localStorage is the source of truth
        return { ...currentState, ...persistedState };
      }
    }
  )
);

import { createClient } from './supabase';

if (typeof window !== 'undefined') {
  let syncTimeout: any;

  useStore.subscribe((state) => {
    // CRITICAL GUARD #1: Only the active organizer dashboard (/dashboard/...) is allowed to upload state to Supabase.
    // NEVER upload from player view (/session/...), TV view, or history pages!
    if (!window.location.pathname.startsWith('/dashboard')) return;

    // Only upload if they are the active organizer running a session
    if (!state.session?.isActive || !state.currentUser) return;
    
    // CRITICAL GUARD #2: Only the actual owner of the session should upload state.
    // If a viewer's phone echoes state back, it overwrites the DB with stale data and causes the court glitch.
    if (state.session.ownerUid !== state.currentUser.id) return;
    
    // Check if Supabase is connected
    const supabase = createClient();
    if (!supabase) return;

    // Debounce the upload to prevent spamming the database
    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(async () => {
       // Strip photos to keep the payload size small for realtime transit
       const sanitizePlayers = (players: Player[]) => players.map(p => ({ ...p, photoUrl: undefined }));
       const payload = {
         players: sanitizePlayers(state.players),
         courts: state.courts,
         matches: state.matches,
         session: state.session
       };
       const { error } = await supabase.from('sessions').upsert({
         id: state.session!.id,
         join_code: state.session!.joinCode,
         owner_uid: state.session!.ownerUid,
         is_active: state.session!.isActive,
         state_json: payload,
         updated_at: new Date().toISOString()
       });
       
       if (error) {
         console.error("Supabase Sync Error:", error);
         alert(`Cloud Sync Error: ${error.message}\nReal-time updates will not work until this is fixed.`);
       }
    }, 500);
  });
}
