import { useStore } from '../src/lib/store';
import { PlayerStatus, CourtStatus, Team, Player } from '../src/types/models';

// Helper to wait
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

describe('Real-Life Chaos Simulations', () => {
  beforeEach(() => {
    useStore.setState({
      players: [],
      courts: [],
      matches: [],
      session: null,
      roster: [],
      sessionHistory: []
    });
  });

  it('Simulation 1: The Chaotic Organizer (Injuries, Swaps, Reversals)', () => {
    // 1. Setup Session
    useStore.getState().initializeSession('chaos-session', 4);
    
    // 2. Add 16 players
    for(let i=1; i<=16; i++) {
      useStore.getState().addPlayer({
        id: `p${i}`,
        name: `Player ${i}`,
        skillLevel: (i % 5) + 1,
        status: PlayerStatus.AVAILABLE,
        allTimeWins: 0,
        allTimeLosses: 0,
        allTimeGamesPlayed: 0,
        allTimeSessionsPlayed: 0,
        sessionWins: 0,
        sessionLosses: 0,
        sessionGamesPlayed: 0,
        consecutiveSitOuts: 0,
        isLatecomer: false,
        recentPartnerIds: [],
        recentOpponentIds: []
      } as unknown as Player);
    }

    // 3. Start 4 matches
    const state1 = useStore.getState();
    const batches = state1.getUpcomingBatches();
    batches.forEach((batch, idx) => {
      state1.startBatch(batch, state1.courts[idx].id);
    });

    let state2 = useStore.getState();
    const match1 = state2.matches[0];
    const match2 = state2.matches[1];

    // 4. INJURY! Player 1 in Match 1 gets injured. Swap with Player 10 (who is waiting)
    // Wait, all 16 are playing on 4 courts. Let's add a latecomer (p17) to swap in.
    state2.addPlayer({
      id: `p17`, name: `Latecomer`, skillLevel: 3, status: PlayerStatus.AVAILABLE,
      allTimeWins: 0, allTimeLosses: 0, allTimeGamesPlayed: 0, allTimeSessionsPlayed: 0,
      sessionWins: 0, sessionLosses: 0, sessionGamesPlayed: 0, consecutiveSitOuts: 0, isLatecomer: true,
      recentPartnerIds: [], recentOpponentIds: []
    } as unknown as Player);
    state2 = useStore.getState();

    // Swap P1 (team A) with P17
    const p1Id = match1.teamA[0];
    state2.swapPlayerInMatch(match1.id, p1Id, 'p17');
    
    // 5. Complete Match 1 (Team A wins)
    state2 = useStore.getState();
    state2.completeMatch(match1.id, Team.A, 11, 5);

    // 6. Complete Match 2 (Team B wins) but then REVERSE it!
    state2 = useStore.getState();
    state2.completeMatch(match2.id, Team.B, 11, 9);
    state2 = useStore.getState();
    state2.reverseMatchWinner(match2.id);

    // 7. Verify stats
    const finalState = useStore.getState();
    
    // P17 should have 1 win. P1 should have 0 wins (was swapped out).
    const p17 = finalState.players.find(p => p.id === 'p17');
    const p1 = finalState.players.find(p => p.id === p1Id);
    
    console.log(JSON.stringify({
      simulation: "Chaos & Errors",
      p17_wins: p17?.sessionWins,
      p1_wins: p1?.sessionWins,
      match2_winner: finalState.matches.find(m => m.id === match2.id)?.winner
    }, null, 2));
    
    expect(p17?.sessionWins).toBe(1);
    expect(p1?.sessionWins).toBe(0);
    expect(finalState.matches.find(m => m.id === match2.id)?.winner).toBe('A');
  });

  it('Simulation 2: Extreme Weather / Court Loss', () => {
    useStore.getState().initializeSession('weather-session', 6); // Starts with 6 courts
    
    for(let i=1; i<=24; i++) {
      useStore.getState().addPlayer({
        id: `p${i}`, name: `Player ${i}`, skillLevel: 3, status: PlayerStatus.AVAILABLE,
        allTimeWins: 0, allTimeLosses: 0, allTimeGamesPlayed: 0, allTimeSessionsPlayed: 0,
        sessionWins: 0, sessionLosses: 0, sessionGamesPlayed: 0, consecutiveSitOuts: 0, isLatecomer: false,
        recentPartnerIds: [], recentOpponentIds: []
      } as unknown as Player);
    }

    // Start 6 matches
    let state = useStore.getState();
    state.getUpcomingBatches().forEach((batch, idx) => {
      state.startBatch(batch, state.courts[idx].id);
    });

    // It starts raining on courts 5 and 6! Organizer deletes them.
    // The store should automatically complete/cancel the matches on those courts.
    state = useStore.getState();
    const court5 = state.courts[4].id;
    const court6 = state.courts[5].id;
    
    state.removeCourt(court5);
    state.removeCourt(court6);

    state = useStore.getState();
    // 16 players should be PLAYING, 8 should be AVAILABLE (because their matches were canceled)
    const playingCount = state.players.filter(p => p.status === PlayerStatus.PLAYING).length;
    const availableCount = state.players.filter(p => p.status === PlayerStatus.AVAILABLE).length;

    console.log(JSON.stringify({
      simulation: "Court Deletion Mid-Game",
      activeCourts: state.courts.length,
      playingPlayers: playingCount,
      freedPlayers: availableCount
    }, null, 2));

    expect(state.courts.length).toBe(4);
    expect(playingCount).toBe(16);
    expect(availableCount).toBe(8);
  });
});
