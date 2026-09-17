import { buildNextBatches } from '../src/engine/queue-engine';
import { useStore } from '../src/lib/store';
import { Player, PlayerStatus, CourtStatus, Team, createPlayer } from '../src/types/models';

describe('Duplicate Entry Prevention & Hardware Locks', () => {
  describe('Queue Engine: buildNextBatches', () => {
    const makePlayer = (id: string, name: string, status = PlayerStatus.AVAILABLE, courtId: string | null = null): Player =>
      createPlayer({
        id,
        name,
        skillLevel: 3,
        status,
        currentCourtId: courtId,
        queuedAtEpochMs: Date.now(),
      });

    it('strictly excludes players who are in activePlayerIds', () => {
      const p1 = makePlayer('p1', 'Alice');
      const p2 = makePlayer('p2', 'Bob');
      const p3 = makePlayer('p3', 'Charlie');
      const p4 = makePlayer('p4', 'Dave');
      const p5 = makePlayer('p5', 'Eve');

      const activeIds = new Set(['p1']);
      const batches = buildNextBatches([p1, p2, p3, p4, p5], 1, 'balanced', activeIds);

      expect(batches.length).toBe(1);
      const scheduledIds = batches[0].map(p => p.id);
      expect(scheduledIds).not.toContain('p1');
      expect(scheduledIds).toEqual(expect.arrayContaining(['p2', 'p3', 'p4', 'p5']));
    });

    it('strictly excludes players who have currentCourtId assigned', () => {
      const p1 = makePlayer('p1', 'Alice', PlayerStatus.AVAILABLE, 'c_1');
      const p2 = makePlayer('p2', 'Bob');
      const p3 = makePlayer('p3', 'Charlie');
      const p4 = makePlayer('p4', 'Dave');
      const p5 = makePlayer('p5', 'Eve');

      const batches = buildNextBatches([p1, p2, p3, p4, p5], 1, 'balanced');
      expect(batches.length).toBe(1);
      const scheduledIds = batches[0].map(p => p.id);
      expect(scheduledIds).not.toContain('p1');
    });

    it('deduplicates duplicate player names case-insensitively', () => {
      const p1 = makePlayer('p1', 'John Doe');
      const p2 = makePlayer('p2', 'john doe'); // duplicate name
      const p3 = makePlayer('p3', 'Charlie');
      const p4 = makePlayer('p4', 'Dave');
      const p5 = makePlayer('p5', 'Eve');

      const batches = buildNextBatches([p1, p2, p3, p4, p5], 1, 'balanced');
      expect(batches.length).toBe(1);
      const names = batches[0].map(p => p.name.toLowerCase());
      const uniqueNames = new Set(names);
      expect(uniqueNames.size).toBe(4);
    });
  });

  describe('Store: startBatch Hardware Locks', () => {
    beforeEach(() => {
      useStore.setState({
        session: {
          id: 's_test',
          joinCode: 'TEST1',
          name: 'Test Session',
          ownerUid: 'owner_1',
          createdAtEpochMs: Date.now(),
          isActive: true,
          courtsPerBatch: 2,
          queueBatchesShown: 1,
          showNextUpToPlayers: true,
        },
        courts: [
          { id: 'c_1', label: 'Court 1', status: CourtStatus.OPEN, currentMatchId: null },
          { id: 'c_2', label: 'Court 2', status: CourtStatus.OPEN, currentMatchId: null },
        ],
        players: [
          createPlayer({ id: 'p1', name: 'Player 1', skillLevel: 3, status: PlayerStatus.AVAILABLE }),
          createPlayer({ id: 'p2', name: 'Player 2', skillLevel: 3, status: PlayerStatus.AVAILABLE }),
          createPlayer({ id: 'p3', name: 'Player 3', skillLevel: 3, status: PlayerStatus.AVAILABLE }),
          createPlayer({ id: 'p4', name: 'Player 4', skillLevel: 3, status: PlayerStatus.AVAILABLE }),
          createPlayer({ id: 'p5', name: 'Player 5', skillLevel: 3, status: PlayerStatus.AVAILABLE }),
          createPlayer({ id: 'p6', name: 'Player 6', skillLevel: 3, status: PlayerStatus.AVAILABLE }),
          createPlayer({ id: 'p7', name: 'Player 7', skillLevel: 3, status: PlayerStatus.AVAILABLE }),
          createPlayer({ id: 'p8', name: 'Player 8', skillLevel: 3, status: PlayerStatus.AVAILABLE }),
        ],
        matches: [],
      });
    });

    it('successfully starts a batch on Court 1 and marks players as PLAYING', () => {
      const state = useStore.getState();
      const batch = {
        teamA: [state.players[0], state.players[1]],
        teamB: [state.players[2], state.players[3]],
      };

      state.startBatch(batch, 'c_1');

      const nextState = useStore.getState();
      expect(nextState.matches.length).toBe(1);
      expect(nextState.courts.find(c => c.id === 'c_1')?.status).toBe(CourtStatus.IN_PROGRESS);

      const p1 = nextState.players.find(p => p.id === 'p1');
      expect(p1?.status).toBe(PlayerStatus.PLAYING);
      expect(p1?.currentCourtId).toBe('c_1');
    });

    it('REJECTS startBatch if any player in the batch is already playing on another court', () => {
      const state = useStore.getState();
      // Match 1 on Court 1 with p1, p2, p3, p4
      const batch1 = {
        teamA: [state.players[0], state.players[1]],
        teamB: [state.players[2], state.players[3]],
      };
      state.startBatch(batch1, 'c_1');

      // Attempt to start Match 2 on Court 2 with p1 (who is already on Court 1!)
      const currentPlayers = useStore.getState().players;
      const batch2WithDuplicate = {
        teamA: [currentPlayers.find(p => p.id === 'p1')!, currentPlayers.find(p => p.id === 'p5')!],
        teamB: [currentPlayers.find(p => p.id === 'p6')!, currentPlayers.find(p => p.id === 'p7')!],
      };

      useStore.getState().startBatch(batch2WithDuplicate, 'c_2');

      const endState = useStore.getState();
      // Second match must NOT have been created!
      expect(endState.matches.length).toBe(1);
      expect(endState.courts.find(c => c.id === 'c_2')?.status).toBe(CourtStatus.OPEN);
      // p1 must still be on Court 1
      const p1 = endState.players.find(p => p.id === 'p1');
      expect(p1?.currentCourtId).toBe('c_1');
    });

    it('REJECTS startBatch if target court is not OPEN or already has an active match', () => {
      const state = useStore.getState();
      const batch1 = {
        teamA: [state.players[0], state.players[1]],
        teamB: [state.players[2], state.players[3]],
      };
      state.startBatch(batch1, 'c_1');

      const batch2 = {
        teamA: [state.players[4], state.players[5]],
        teamB: [state.players[6], state.players[7]],
      };
      // Try sending another batch to Court 1 while Court 1 is already in progress
      useStore.getState().startBatch(batch2, 'c_1');

      const endState = useStore.getState();
      expect(endState.matches.length).toBe(1);
    });

    it('getUpcomingBatches excludes players who are in an active match', () => {
      const state = useStore.getState();
      const batch1 = {
        teamA: [state.players[0], state.players[1]],
        teamB: [state.players[2], state.players[3]],
      };
      state.startBatch(batch1, 'c_1');

      const upcoming = useStore.getState().getUpcomingBatches();
      // Should have 1 batch for Court 2 consisting of p5, p6, p7, p8
      expect(upcoming.length).toBe(1);
      const upcomingIds = [...upcoming[0].teamA, ...upcoming[0].teamB].map(p => p.id);
      expect(upcomingIds).not.toContain('p1');
      expect(upcomingIds).not.toContain('p2');
      expect(upcomingIds).not.toContain('p3');
      expect(upcomingIds).not.toContain('p4');
      expect(upcomingIds).toEqual(expect.arrayContaining(['p5', 'p6', 'p7', 'p8']));
    });

    it('swapPlayerInMatch properly frees old player and locks new player', () => {
      const state = useStore.getState();
      const batch1 = {
        teamA: [state.players[0], state.players[1]],
        teamB: [state.players[2], state.players[3]],
      };
      state.startBatch(batch1, 'c_1');

      const matchId = useStore.getState().matches[0].id;
      // Swap out p1 for p5
      useStore.getState().swapPlayerInMatch(matchId, Team.A, 'p1', 'p5');

      const endState = useStore.getState();
      const p1 = endState.players.find(p => p.id === 'p1');
      const p5 = endState.players.find(p => p.id === 'p5');

      expect(p1?.status).toBe(PlayerStatus.AVAILABLE);
      expect(p1?.currentCourtId).toBeNull();
      expect(p5?.status).toBe(PlayerStatus.PLAYING);
      expect(p5?.currentCourtId).toBe('c_1');

      const activeMatch = endState.matches[0];
      expect(activeMatch.teamA).toContain('p5');
      expect(activeMatch.teamA).not.toContain('p1');
    });

    it('swapPlayerInMatch rejects swapping in a player who is already playing elsewhere', () => {
      const state = useStore.getState();
      state.startBatch(
        { teamA: [state.players[0], state.players[1]], teamB: [state.players[2], state.players[3]] },
        'c_1'
      );
      state.startBatch(
        { teamA: [state.players[4], state.players[5]], teamB: [state.players[6], state.players[7]] },
        'c_2'
      );

      const match1Id = useStore.getState().matches[0].id;
      // Try to sub in p5 (who is playing on Court 2) into Match 1
      useStore.getState().swapPlayerInMatch(match1Id, Team.A, 'p1', 'p5');

      const endState = useStore.getState();
      const match1 = endState.matches.find(m => m.id === match1Id);
      expect(match1?.teamA).toContain('p1');
      expect(match1?.teamA).not.toContain('p5');
    });

    it('addPlayer prevents duplicate player names in the same session', () => {
      const state = useStore.getState();
      const initialCount = state.players.length;

      state.addPlayer(createPlayer({ id: 'p_new', name: 'player 1', skillLevel: 4 }));

      expect(useStore.getState().players.length).toBe(initialCount);
    });
  });
});
