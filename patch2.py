import os

base_dir = r"C:\Users\test\Downloads\QQQQQQ\QQQQQQ\web\src"

def rewrite_file(path, content):
    with open(os.path.join(base_dir, path), "w", encoding="utf-8") as f:
        f.write(content)

with open(os.path.join(base_dir, "lib/store.ts"), "r", encoding="utf-8") as f:
    store_content = f.read()

# Replace `let recentPartners = [...p.recentPartnerIds];`
store_content = store_content.replace("""        let recentPartners = [...p.recentPartnerIds];
        let recentOpponents = [...p.recentOpponentIds];
        
        const partner = isTeamA ? match.teamA.find(id => id !== p.id) : match.teamB.find(id => id !== p.id);
        if (partner) {
            recentPartners.unshift(partner);
            if (recentPartners.length > 3) recentPartners.pop();
        }

        const opponents = isTeamA ? match.teamB : match.teamA;
        for (const op of opponents) {
            recentOpponents.unshift(op);
        }
        recentOpponents = recentOpponents.slice(0, 6); // Keep last 6 opponents""", """        const partner = isTeamA ? match.teamA.find(id => id !== p.id) : match.teamB.find(id => id !== p.id);
        const recentPartners = partner 
            ? [partner, ...p.recentPartnerIds].slice(0, 3) 
            : p.recentPartnerIds;

        const opponents = isTeamA ? match.teamB : match.teamA;
        const recentOpponents = [...opponents, ...p.recentOpponentIds].slice(0, 6);""")

# Remove unused imports and variables in store.ts (doesn't have many, but we will add roster)

# Let's completely rewrite store.ts to handle roster.
store_content_new = """import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Player, Court, Match, Session, PlayerStatus, Team, ProposedMatch, CourtStatus } from '@/types/models';
import { buildNextBatches, incrementSitOuts } from '@/engine/queue-engine';
import { pairFour } from '@/engine/pairing-engine';

interface StoreState {
  sessionId: string | null;
  joinCode: string | null;
  players: Player[];
  courts: Court[];
  matches: Match[];
  session: Session | null;
  
  roster: Player[];
  
  setSession: (session: Session | null) => void;
  setPlayers: (players: Player[]) => void;
  setCourts: (courts: Court[]) => void;
  setMatches: (matches: Match[]) => void;
  
  addPlayer: (player: Player) => void;
  updatePlayer: (player: Player) => void;
  removePlayer: (id: string) => void;
  
  saveToRoster: (player: Player) => void;
  
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
  
  getUpcomingBatches: () => ProposedMatch[];
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      sessionId: null,
      joinCode: null,
      players: [],
      courts: [],
      matches: [],
      session: null,
      roster: [],
      
      setSession: (session) => set({ session, sessionId: session?.id ?? null, joinCode: session?.joinCode ?? null }),
      setPlayers: (players) => set({ players }),
      setCourts: (courts) => set({ courts }),
      setMatches: (matches) => set({ matches }),
      
      addPlayer: (player) => {
        set((state) => ({ players: [...state.players, player] }));
        get().saveToRoster(player);
      },
      updatePlayer: (player) => {
        set((state) => ({ players: state.players.map(p => p.id === player.id ? player : p) }));
        get().saveToRoster(player);
      },
      removePlayer: (id) => set((state) => ({ players: state.players.filter(p => p.id !== id) })),
      
      saveToRoster: (player) => set((state) => {
        const existing = state.roster.find(p => p.name.toLowerCase() === player.name.toLowerCase());
        if (existing) {
          return { roster: state.roster.map(p => p.id === existing.id ? { ...p, ...player } : p) };
        }
        return { roster: [...state.roster, player] };
      }),
      
      addCourt: (court) => set((state) => {
        // Track max court number to increment properly
        const maxCourtNum = state.courts.reduce((max, c) => {
          const m = c.label.match(/Court (\\d+)/);
          return m ? Math.max(max, parseInt(m[1], 10)) : max;
        }, 0);
        return { courts: [...state.courts, { ...court, label: `Court ${maxCourtNum + 1}` }] };
      }),
      updateCourt: (court) => set((state) => ({ courts: state.courts.map(c => c.id === court.id ? court : c) })),
      removeCourt: (id) => set((state) => {
        const court = state.courts.find(c => c.id === id);
        if (court && court.currentMatchId) {
            // Cancel match and free players
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

        return { matches: newMatches, players: updatedPlayersWithSitouts, courts: newCourts };
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

      getUpcomingBatches: () => {
        const state = get();
        const openCourts = state.courts.filter(c => c.status === CourtStatus.OPEN).length;
        if (openCourts === 0) return [];

        const batches = buildNextBatches(state.players, openCourts);
        return batches.map(b => pairFour(b));
      }
    }),
    {
      name: 'pickleball-roster-storage',
      partialize: (state) => ({ roster: state.roster }),
    }
  )
);
"""
rewrite_file(r"lib/store.ts", store_content_new)
