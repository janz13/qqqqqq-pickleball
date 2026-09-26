/**
 * Full Audit & Stress Test Suite — Varied Parameters
 * 
 * 60 scenarios testing every feature with DIFFERENT parameters than the
 * existing test suite. Covers: session lifecycle, roster, queue engine
 * (varied player/court counts), court ops, match flow, swaps, scoring,
 * winner reversal, end session, history, and concurrency.
 */

import { useStore } from '../src/lib/store';
import { buildNextBatches, priorityOrder, incrementSitOuts, catchUpTargetForNewPlayer, refreshCatchUpStatus } from '../src/engine/queue-engine';
import { pairFour, scoreMatch } from '../src/engine/pairing-engine';
import { Player, PlayerStatus, Court, CourtStatus, Match, Team, Session, createPlayer, ProposedMatch } from '../src/types/models';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mkPlayer(
  id: string,
  name: string,
  skillLevel = 3,
  status = PlayerStatus.AVAILABLE,
  extra: Partial<Player> = {}
): Player {
  return createPlayer({
    id,
    name,
    skillLevel,
    status,
    queuedAtEpochMs: Date.now() - Math.random() * 100000,
    joinedSessionAtEpochMs: Date.now(),
    ...extra,
  });
}

function initSession(name: string, courts: number, labels?: string[]) {
  const store = useStore.getState();
  store.setCurrentUser({ email: 'test@test.com', id: 'organizer_1' });
  return store.initializeSession(name, courts, labels);
}

function addPlayers(count: number, skillRange: [number, number] = [1, 5], prefix = 'P') {
  const store = useStore.getState();
  for (let i = 1; i <= count; i++) {
    const skill = skillRange[0] + (i % (skillRange[1] - skillRange[0] + 1));
    store.addPlayer(mkPlayer(`p_${prefix}_${i}`, `${prefix}${i}`, skill));
  }
}

function runMatchCycle(courtIndex = 0): { matchId: string } | null {
  const store = useStore.getState();
  const { courts, matches } = store;
  const openCourt = courts[courtIndex];
  if (!openCourt || openCourt.status !== CourtStatus.OPEN) return null;

  const batches = store.getUpcomingBatches();
  if (batches.length === 0) return null;

  store.startBatch(batches[0], openCourt.id);
  const state = useStore.getState();
  const activeMatch = state.matches.find(
    m => m.courtId === openCourt.id && m.endedAtEpochMs == null
  );
  return activeMatch ? { matchId: activeMatch.id } : null;
}

function completeAllActive(winner: Team = Team.A) {
  const store = useStore.getState();
  const active = store.matches.filter(m => m.endedAtEpochMs == null);
  active.forEach(m => store.completeMatch(m.id, winner, 11, 7));
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Full Audit Stress Test — Varied Parameters (60 Scenarios)', () => {
  beforeEach(() => {
    useStore.setState({
      currentUser: null,
      session: null,
      sessionId: null,
      joinCode: null,
      players: [],
      courts: [],
      matches: [],
      sessionHistory: [],
      roster: [],
      rostersByOwner: {},
      ttsEnabled: false,
      ttsVoice: null,
      ttsRate: 1.0,
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 1: Session Creation & Initialization (Tests 1-8)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 1: Session Creation & Initialization', () => {
    it('Test 1: Creates session with 1 court', () => {
      const session = initSession('Solo Court', 1);
      const state = useStore.getState();
      expect(state.courts).toHaveLength(1);
      expect(state.courts[0].label).toBe('Court 1');
      expect(state.courts[0].status).toBe(CourtStatus.OPEN);
      expect(session.joinCode).toHaveLength(5);
    });

    it('Test 2: Creates session with 8 courts', () => {
      const session = initSession('Big Venue', 8);
      const state = useStore.getState();
      expect(state.courts).toHaveLength(8);
      for (let i = 0; i < 8; i++) {
        expect(state.courts[i].label).toBe(`Court ${i + 1}`);
        expect(state.courts[i].id).toBe(`c_${i + 1}`);
      }
    });

    it('Test 3: Creates session with 10 courts (maximum)', () => {
      initSession('Max Courts', 10);
      const state = useStore.getState();
      expect(state.courts).toHaveLength(10);
      expect(state.courts[9].label).toBe('Court 10');
    });

    it('Test 4: Session has unique join code each time', () => {
      const s1 = initSession('A', 2);
      const code1 = s1.joinCode;
      useStore.setState({ session: null, sessionId: null, joinCode: null, courts: [], players: [], matches: [] });
      const s2 = initSession('B', 2);
      expect(s2.joinCode).not.toBe(code1);
    });

    it('Test 5: Custom court labels are applied', () => {
      initSession('Custom', 3, ['Alpha', 'Bravo', 'Charlie']);
      const state = useStore.getState();
      expect(state.courts[0].label).toBe('Alpha');
      expect(state.courts[1].label).toBe('Bravo');
      expect(state.courts[2].label).toBe('Charlie');
    });

    it('Test 6: Partial custom labels fill remaining with defaults', () => {
      initSession('Partial', 4, ['Main', 'Gym']);
      const state = useStore.getState();
      expect(state.courts[0].label).toBe('Main');
      expect(state.courts[1].label).toBe('Gym');
      expect(state.courts[2].label).toBe('Court 3');
      expect(state.courts[3].label).toBe('Court 4');
    });

    it('Test 7: Session owner is set correctly', () => {
      initSession('Owner Test', 2);
      const state = useStore.getState();
      expect(state.session!.ownerUid).toBe('organizer_1');
    });

    it('Test 8: Session starts with empty players and matches', () => {
      initSession('Empty', 3);
      const state = useStore.getState();
      expect(state.players).toHaveLength(0);
      expect(state.matches).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: Player Roster Management (Tests 9-16)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 2: Player Roster Management', () => {
    it('Test 9: Add 8 players to session', () => {
      initSession('Small', 2);
      addPlayers(8);
      expect(useStore.getState().players).toHaveLength(8);
    });

    it('Test 10: Add 24 players to session', () => {
      initSession('Medium', 4);
      addPlayers(24);
      expect(useStore.getState().players).toHaveLength(24);
    });

    it('Test 11: Add 48 players to session', () => {
      initSession('Large', 6);
      addPlayers(48);
      expect(useStore.getState().players).toHaveLength(48);
    });

    it('Test 12: Duplicate name rejection (case-insensitive)', () => {
      initSession('Dedup', 2);
      const store = useStore.getState();
      store.addPlayer(mkPlayer('p1', 'John'));
      store.addPlayer(mkPlayer('p2', 'john'));  // Duplicate!
      store.addPlayer(mkPlayer('p3', 'JOHN'));  // Duplicate!
      expect(useStore.getState().players).toHaveLength(1);
    });

    it('Test 13: Duplicate ID rejection', () => {
      initSession('DedupID', 2);
      const store = useStore.getState();
      store.addPlayer(mkPlayer('same_id', 'Alice'));
      store.addPlayer(mkPlayer('same_id', 'Bob'));
      expect(useStore.getState().players).toHaveLength(1);
    });

    it('Test 14: Remove player from session', () => {
      initSession('Remove', 2);
      addPlayers(5);
      const store = useStore.getState();
      const playerId = store.players[2].id;
      store.removePlayer(playerId);
      expect(useStore.getState().players).toHaveLength(4);
      expect(useStore.getState().players.find(p => p.id === playerId)).toBeUndefined();
    });

    it('Test 15: Update player skill level', () => {
      initSession('Skill', 2);
      addPlayers(4);
      const store = useStore.getState();
      const pid = store.players[0].id;
      store.updatePlayerSkill(pid, 5);
      expect(useStore.getState().players.find(p => p.id === pid)!.skillLevel).toBe(5);
    });

    it('Test 16: Player status toggle (available → resting → available)', () => {
      initSession('Status', 2);
      addPlayers(4);
      const store = useStore.getState();
      const pid = store.players[0].id;
      store.updatePlayerStatus(pid, PlayerStatus.RESTING);
      expect(useStore.getState().players.find(p => p.id === pid)!.status).toBe(PlayerStatus.RESTING);
      useStore.getState().updatePlayerStatus(pid, PlayerStatus.AVAILABLE);
      expect(useStore.getState().players.find(p => p.id === pid)!.status).toBe(PlayerStatus.AVAILABLE);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: Duo Queue & Locked Partners (Tests 17-22)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 3: Duo Queue & Locked Partners', () => {
    it('Test 17: Lock two players as duo partners', () => {
      initSession('Duo', 2);
      addPlayers(8);
      const state = useStore.getState();
      const [a, b] = [state.players[0].id, state.players[1].id];
      state.setLockedPartner(a, b);
      const updated = useStore.getState();
      expect(updated.players.find(p => p.id === a)!.lockedPartnerId).toBe(b);
      expect(updated.players.find(p => p.id === b)!.lockedPartnerId).toBe(a);
    });

    it('Test 18: Unlock duo partners', () => {
      initSession('Unlock', 2);
      addPlayers(8);
      const state = useStore.getState();
      const [a, b] = [state.players[0].id, state.players[1].id];
      state.setLockedPartner(a, b);
      useStore.getState().unlockPartner(a);
      const updated = useStore.getState();
      expect(updated.players.find(p => p.id === a)!.lockedPartnerId).toBeNull();
      expect(updated.players.find(p => p.id === b)!.lockedPartnerId).toBeNull();
    });

    it('Test 19: Locked pair always ends up on the same team', () => {
      const players = [
        mkPlayer('la', 'Anna', 3, PlayerStatus.AVAILABLE, { lockedPartnerId: 'lb' }),
        mkPlayer('lb', 'Bella', 3, PlayerStatus.AVAILABLE, { lockedPartnerId: 'la' }),
        mkPlayer('lc', 'Carl', 3),
        mkPlayer('ld', 'Dave', 3),
      ];
      const match = pairFour(players);
      const teamAIds = match.teamA.map(p => p.id);
      const teamBIds = match.teamB.map(p => p.id);
      const annaInA = teamAIds.includes('la');
      const bellaInA = teamAIds.includes('lb');
      const annaInB = teamBIds.includes('la');
      const bellaInB = teamBIds.includes('lb');
      expect(annaInA === bellaInA || annaInB === bellaInB).toBe(true);
    });

    it('Test 20: Locked pair in buildNextBatches stays together', () => {
      initSession('DuoBatch', 2);
      const store = useStore.getState();
      for (let i = 1; i <= 8; i++) {
        store.addPlayer(mkPlayer(`dp_${i}`, `DPlayer${i}`, 3, PlayerStatus.AVAILABLE,
          i === 1 ? { lockedPartnerId: 'dp_2' } : i === 2 ? { lockedPartnerId: 'dp_1' } : {}
        ));
      }
      const batches = buildNextBatches(useStore.getState().players, 2);
      // Find the batch containing dp_1
      const batchWithDuo = batches.find(b => b.some(p => p.id === 'dp_1'));
      if (batchWithDuo) {
        expect(batchWithDuo.some(p => p.id === 'dp_2')).toBe(true);
      }
    });

    it('Test 21: Re-locking to new partner breaks old lock', () => {
      initSession('Relock', 2);
      addPlayers(6);
      const state = useStore.getState();
      const [a, b, c] = [state.players[0], state.players[1], state.players[2]];
      // Lock A-B
      state.setLockedPartner(a.id, b.id);
      // Now lock A-C via updatePlayer
      useStore.getState().updatePlayer({ ...useStore.getState().players.find(p => p.id === a.id)!, lockedPartnerId: c.id });
      const updated = useStore.getState();
      expect(updated.players.find(p => p.id === a.id)!.lockedPartnerId).toBe(c.id);
      expect(updated.players.find(p => p.id === c.id)!.lockedPartnerId).toBe(a.id);
      // B should be unlocked
      expect(updated.players.find(p => p.id === b.id)!.lockedPartnerId).toBeNull();
    });

    it('Test 22: Duo pair with mixed skill levels stays together', () => {
      const players = [
        mkPlayer('duo_a', 'Alex', 5, PlayerStatus.AVAILABLE, { lockedPartnerId: 'duo_b' }),
        mkPlayer('duo_b', 'Beth', 2, PlayerStatus.AVAILABLE, { lockedPartnerId: 'duo_a' }),
        mkPlayer('duo_c', 'Chris', 4),
        mkPlayer('duo_d', 'Diana', 3),
      ];
      const match = pairFour(players);
      const teamAIds = new Set(match.teamA.map(p => p.id));
      // Alex and Beth must be on the same team
      expect(teamAIds.has('duo_a') === teamAIds.has('duo_b')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: Queue Engine Stress — Varied Counts (Tests 23-32)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 4: Queue Engine — Varied Counts', () => {
    it('Test 23: 4 players, 1 court → 1 batch', () => {
      const players = Array.from({ length: 4 }, (_, i) => mkPlayer(`q_${i}`, `Q${i}`, 3));
      const batches = buildNextBatches(players, 1);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toHaveLength(4);
    });

    it('Test 24: 8 players, 2 courts → 2 batches', () => {
      const players = Array.from({ length: 8 }, (_, i) => mkPlayer(`q_${i}`, `Q${i}`, 3));
      const batches = buildNextBatches(players, 2);
      expect(batches).toHaveLength(2);
    });

    it('Test 25: 12 players, 3 courts → 3 batches', () => {
      const players = Array.from({ length: 12 }, (_, i) => mkPlayer(`q_${i}`, `Q${i}`, 3));
      const batches = buildNextBatches(players, 3);
      expect(batches).toHaveLength(3);
    });

    it('Test 26: 5 players, 2 courts → 1 batch (not enough for 2)', () => {
      const players = Array.from({ length: 5 }, (_, i) => mkPlayer(`q_${i}`, `Q${i}`, 3));
      const batches = buildNextBatches(players, 2);
      expect(batches).toHaveLength(1);
    });

    it('Test 27: 3 players, 1 court → 0 batches (not enough)', () => {
      const players = Array.from({ length: 3 }, (_, i) => mkPlayer(`q_${i}`, `Q${i}`, 3));
      const batches = buildNextBatches(players, 1);
      expect(batches).toHaveLength(0);
    });

    it('Test 28: 0 players → 0 batches', () => {
      const batches = buildNextBatches([], 3);
      expect(batches).toHaveLength(0);
    });

    it('Test 29: 36 players, 6 courts → 6 batches', () => {
      const players = Array.from({ length: 36 }, (_, i) => mkPlayer(`q_${i}`, `Q${i}`, (i % 5) + 1));
      const batches = buildNextBatches(players, 6);
      expect(batches).toHaveLength(6);
    });

    it('Test 30: No duplicate players across batches', () => {
      const players = Array.from({ length: 20 }, (_, i) => mkPlayer(`q_${i}`, `Q${i}`, 3));
      const batches = buildNextBatches(players, 4);
      const allIds = batches.flat().map(p => p.id);
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(allIds.length);
    });

    it('Test 31: Active players are excluded from batches', () => {
      const players = Array.from({ length: 8 }, (_, i) => mkPlayer(`q_${i}`, `Q${i}`, 3));
      const activeIds = new Set(['q_0', 'q_1', 'q_2', 'q_3']);
      const batches = buildNextBatches(players, 2, 'balanced', activeIds);
      expect(batches).toHaveLength(1);
      const batchIds = batches[0].map(p => p.id);
      expect(batchIds).not.toContain('q_0');
      expect(batchIds).not.toContain('q_1');
    });

    it('Test 32: PLAYING status players excluded from batches', () => {
      const players = [
        mkPlayer('q_0', 'A', 3, PlayerStatus.PLAYING, { currentCourtId: 'c_1' }),
        mkPlayer('q_1', 'B', 3, PlayerStatus.PLAYING, { currentCourtId: 'c_1' }),
        mkPlayer('q_2', 'C', 3, PlayerStatus.PLAYING, { currentCourtId: 'c_1' }),
        mkPlayer('q_3', 'D', 3, PlayerStatus.PLAYING, { currentCourtId: 'c_1' }),
        mkPlayer('q_4', 'E', 3),
        mkPlayer('q_5', 'F', 3),
        mkPlayer('q_6', 'G', 3),
        mkPlayer('q_7', 'H', 3),
      ];
      const batches = buildNextBatches(players, 2);
      expect(batches).toHaveLength(1);
      const ids = new Set(batches[0].map(p => p.id));
      expect(ids.has('q_0')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: Priority & Fairness (Tests 33-38)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 5: Priority & Fairness', () => {
    it('Test 33: Latecomers get priority over regular players', () => {
      const players = [
        mkPlayer('reg', 'Regular', 3, PlayerStatus.AVAILABLE, { sessionGamesPlayed: 3 }),
        mkPlayer('late', 'Late', 3, PlayerStatus.AVAILABLE, { isLatecomer: true, hasCaughtUp: false, catchUpTargetGames: 3, sessionGamesPlayed: 0 }),
      ];
      const sorted = priorityOrder(players);
      expect(sorted[0].id).toBe('late');
    });

    it('Test 34: Fewest games played gets priority', () => {
      const players = [
        mkPlayer('a', 'A', 3, PlayerStatus.AVAILABLE, { sessionGamesPlayed: 5 }),
        mkPlayer('b', 'B', 3, PlayerStatus.AVAILABLE, { sessionGamesPlayed: 2 }),
        mkPlayer('c', 'C', 3, PlayerStatus.AVAILABLE, { sessionGamesPlayed: 8 }),
      ];
      const sorted = priorityOrder(players);
      expect(sorted[0].id).toBe('b');
      expect(sorted[2].id).toBe('c');
    });

    it('Test 35: Consecutive sit-outs break tie for same game count', () => {
      const players = [
        mkPlayer('a', 'A', 3, PlayerStatus.AVAILABLE, { sessionGamesPlayed: 3, consecutiveSitOuts: 0 }),
        mkPlayer('b', 'B', 3, PlayerStatus.AVAILABLE, { sessionGamesPlayed: 3, consecutiveSitOuts: 4 }),
      ];
      const sorted = priorityOrder(players);
      expect(sorted[0].id).toBe('b');
    });

    it('Test 36: Catch-up target for new player calculated correctly', () => {
      const roster = [
        mkPlayer('a', 'A', 3, PlayerStatus.AVAILABLE, { sessionGamesPlayed: 5 }),
        mkPlayer('b', 'B', 3, PlayerStatus.AVAILABLE, { sessionGamesPlayed: 3 }),
        mkPlayer('c', 'C', 3, PlayerStatus.AVAILABLE, { sessionGamesPlayed: 7 }),
        mkPlayer('d', 'D', 3, PlayerStatus.AVAILABLE, { sessionGamesPlayed: 4 }),
      ];
      const target = catchUpTargetForNewPlayer(roster);
      // Sorted: [3,4,5,7], median = ceil((4+5)/2) = 5
      expect(target).toBe(5);
    });

    it('Test 37: refreshCatchUpStatus clears latecomer flag once caught up', () => {
      const player = mkPlayer('late', 'Late', 3, PlayerStatus.AVAILABLE, {
        isLatecomer: true, hasCaughtUp: false, catchUpTargetGames: 3, sessionGamesPlayed: 3
      });
      const refreshed = refreshCatchUpStatus(player);
      expect(refreshed.hasCaughtUp).toBe(true);
    });

    it('Test 38: incrementSitOuts increments non-selected available players only', () => {
      const players = [
        mkPlayer('a', 'A', 3, PlayerStatus.AVAILABLE, { consecutiveSitOuts: 2 }),
        mkPlayer('b', 'B', 3, PlayerStatus.PLAYING, { consecutiveSitOuts: 0 }),
        mkPlayer('c', 'C', 3, PlayerStatus.RESTING, { consecutiveSitOuts: 1 }),
        mkPlayer('d', 'D', 3, PlayerStatus.AVAILABLE, { consecutiveSitOuts: 0 }),
      ];
      const selected = new Set(['a']);
      const result = incrementSitOuts(players, selected);
      expect(result.find(p => p.id === 'a')!.consecutiveSitOuts).toBe(0); // selected → reset
      expect(result.find(p => p.id === 'b')!.consecutiveSitOuts).toBe(0); // PLAYING → unchanged
      expect(result.find(p => p.id === 'c')!.consecutiveSitOuts).toBe(1); // RESTING → unchanged
      expect(result.find(p => p.id === 'd')!.consecutiveSitOuts).toBe(1); // AVAILABLE not selected → +1
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: Court Operations (Tests 39-44)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 6: Court Operations', () => {
    it('Test 39: Add court dynamically after session creation', () => {
      initSession('Dynamic', 2);
      const store = useStore.getState();
      store.addCourt({ id: 'c_new', label: '', status: CourtStatus.OPEN, currentMatchId: null });
      expect(useStore.getState().courts).toHaveLength(3);
      expect(useStore.getState().courts[2].label).toBe('Court 3');
    });

    it('Test 40: Remove open court', () => {
      initSession('RemoveCourt', 3);
      const store = useStore.getState();
      store.removeCourt('c_2');
      expect(useStore.getState().courts).toHaveLength(2);
    });

    it('Test 41: Remove court with active match frees players', () => {
      initSession('RemoveActive', 2);
      addPlayers(8);
      const result = runMatchCycle(0);
      expect(result).not.toBeNull();
      
      const stateBeforeRemove = useStore.getState();
      const match = stateBeforeRemove.matches.find(m => m.endedAtEpochMs == null);
      expect(match).toBeDefined();
      const matchPlayers = [...match!.teamA, ...match!.teamB];
      
      useStore.getState().removeCourt(match!.courtId);
      const stateAfter = useStore.getState();
      
      // All match players should be AVAILABLE again
      matchPlayers.forEach(pid => {
        const player = stateAfter.players.find(p => p.id === pid);
        expect(player!.status).toBe(PlayerStatus.AVAILABLE);
        expect(player!.currentCourtId).toBeNull();
      });
    });

    it('Test 42: Update court label', () => {
      initSession('Labels', 2);
      const store = useStore.getState();
      store.updateCourt({ ...store.courts[0], label: 'Main Arena' });
      expect(useStore.getState().courts[0].label).toBe('Main Arena');
    });

    it('Test 43: Adding court after removal increments label correctly', () => {
      initSession('Increment', 3);
      const store = useStore.getState();
      store.removeCourt('c_2');
      store.addCourt({ id: 'c_new', label: '', status: CourtStatus.OPEN, currentMatchId: null });
      // Should be "Court 4" because max existing is "Court 3"
      const courts = useStore.getState().courts;
      const newCourt = courts.find(c => c.id === 'c_new');
      expect(newCourt!.label).toBe('Court 4');
    });

    it('Test 44: Court status transitions correctly', () => {
      initSession('StatusTest', 2);
      addPlayers(4);
      
      // Start a match on court 1
      const batch = useStore.getState().getUpcomingBatches();
      expect(batch.length).toBeGreaterThan(0);
      useStore.getState().startBatch(batch[0], 'c_1');
      expect(useStore.getState().courts[0].status).toBe(CourtStatus.IN_PROGRESS);
      
      // Complete the match
      const match = useStore.getState().matches.find(m => m.endedAtEpochMs == null)!;
      useStore.getState().completeMatch(match.id, Team.A, 11, 5);
      expect(useStore.getState().courts[0].status).toBe(CourtStatus.OPEN);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: Match Flow & Scoring (Tests 45-52)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 7: Match Flow & Scoring', () => {
    it('Test 45: Start batch sets players to PLAYING', () => {
      initSession('Play', 2);
      addPlayers(8);
      const batch = useStore.getState().getUpcomingBatches();
      useStore.getState().startBatch(batch[0], 'c_1');
      const state = useStore.getState();
      const match = state.matches[0];
      [...match.teamA, ...match.teamB].forEach(pid => {
        const p = state.players.find(pp => pp.id === pid)!;
        expect(p.status).toBe(PlayerStatus.PLAYING);
        expect(p.currentCourtId).toBe('c_1');
      });
    });

    it('Test 46: Complete match updates wins/losses correctly', () => {
      initSession('Score', 2);
      addPlayers(8);
      const batch = useStore.getState().getUpcomingBatches();
      useStore.getState().startBatch(batch[0], 'c_1');
      const match = useStore.getState().matches[0];
      useStore.getState().completeMatch(match.id, Team.A, 11, 8);
      
      const state = useStore.getState();
      match.teamA.forEach(pid => {
        const p = state.players.find(pp => pp.id === pid)!;
        expect(p.sessionWins).toBe(1);
        expect(p.sessionLosses).toBe(0);
        expect(p.status).toBe(PlayerStatus.AVAILABLE);
      });
      match.teamB.forEach(pid => {
        const p = state.players.find(pp => pp.id === pid)!;
        expect(p.sessionLosses).toBe(1);
        expect(p.sessionWins).toBe(0);
      });
    });

    it('Test 47: Reject starting batch on occupied court', () => {
      initSession('OccupiedCourt', 2);
      addPlayers(12);
      const batch = useStore.getState().getUpcomingBatches();
      useStore.getState().startBatch(batch[0], 'c_1');
      
      // Try to start another batch on the same court
      const batch2 = useStore.getState().getUpcomingBatches();
      if (batch2.length > 0) {
        useStore.getState().startBatch(batch2[0], 'c_1');
        // Should still have only 1 match on court c_1
        const c1Matches = useStore.getState().matches.filter(m => m.courtId === 'c_1' && m.endedAtEpochMs == null);
        expect(c1Matches).toHaveLength(1);
      }
    });

    it('Test 48: Reject batch with player already in active match', () => {
      initSession('DupPlayer', 2);
      addPlayers(8);
      
      // Start a batch on court 1
      const batch1 = useStore.getState().getUpcomingBatches();
      useStore.getState().startBatch(batch1[0], 'c_1');
      
      // The second batch (if any) must not contain players from match 1
      const batch2 = useStore.getState().getUpcomingBatches();
      if (batch2.length > 0) {
        const match1 = useStore.getState().matches[0];
        const match1Players = new Set([...match1.teamA, ...match1.teamB]);
        const batch2Players = [...batch2[0].teamA, ...batch2[0].teamB].map(p => p.id);
        batch2Players.forEach(pid => {
          expect(matchPlayers(match1Players, pid)).toBe(false);
        });
      }
    });

    it('Test 49: Reject batch with fewer than 4 unique players', () => {
      initSession('Short', 1);
      const store = useStore.getState();
      const p = mkPlayer('p1', 'Solo', 3);
      // Manually try a batch with duplicates
      const fakeBatch: ProposedMatch = {
        teamA: [p, p],
        teamB: [p, p]
      };
      store.startBatch(fakeBatch, 'c_1');
      // Should be rejected — no match created
      expect(useStore.getState().matches).toHaveLength(0);
    });

    it('Test 50: Multi-court simultaneous matches', () => {
      initSession('Multi', 4);
      addPlayers(20);
      
      const batches = useStore.getState().getUpcomingBatches();
      const openCourts = useStore.getState().courts.filter(c => c.status === CourtStatus.OPEN);
      const startCount = Math.min(batches.length, openCourts.length);
      
      for (let i = 0; i < startCount; i++) {
        useStore.getState().startBatch(batches[i], openCourts[i].id);
      }
      
      const activeMatches = useStore.getState().matches.filter(m => m.endedAtEpochMs == null);
      expect(activeMatches.length).toBe(startCount);
      
      // Verify no player is in multiple matches
      const allPlayerIds: string[] = [];
      activeMatches.forEach(m => allPlayerIds.push(...m.teamA, ...m.teamB));
      expect(new Set(allPlayerIds).size).toBe(allPlayerIds.length);
    });

    it('Test 51: Complete match updates recent partners/opponents', () => {
      initSession('History', 2);
      addPlayers(8);
      const batch = useStore.getState().getUpcomingBatches();
      useStore.getState().startBatch(batch[0], 'c_1');
      const match = useStore.getState().matches[0];
      useStore.getState().completeMatch(match.id, Team.B, 9, 11);
      
      const state = useStore.getState();
      const teamAPlayer = state.players.find(p => p.id === match.teamA[0])!;
      // Should have the partner in recent partners
      expect(teamAPlayer.recentPartnerIds).toContain(match.teamA[1]);
      // Should have opponents in recent opponents
      expect(teamAPlayer.recentOpponentIds).toContain(match.teamB[0]);
      expect(teamAPlayer.recentOpponentIds).toContain(match.teamB[1]);
    });

    it('Test 52: Session games played increments after match completion', () => {
      initSession('GamesPlayed', 1);
      addPlayers(8);
      
      // Run 3 rounds
      for (let round = 0; round < 3; round++) {
        const batch = useStore.getState().getUpcomingBatches();
        if (batch.length === 0) break;
        useStore.getState().startBatch(batch[0], 'c_1');
        const match = useStore.getState().matches.find(m => m.endedAtEpochMs == null)!;
        useStore.getState().completeMatch(match.id, round % 2 === 0 ? Team.A : Team.B, 11, 5);
      }
      
      const state = useStore.getState();
      // Some players should have played games
      const totalGames = state.players.reduce((sum, p) => sum + p.sessionGamesPlayed, 0);
      expect(totalGames).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8: Player Swapping (Tests 53-56)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 8: Player Swapping', () => {
    it('Test 53: Swap player in active match', () => {
      initSession('Swap', 2);
      addPlayers(8);
      const batch = useStore.getState().getUpcomingBatches();
      useStore.getState().startBatch(batch[0], 'c_1');
      
      const match = useStore.getState().matches[0];
      const oldPlayerId = match.teamA[0];
      const availablePlayer = useStore.getState().players.find(
        p => p.status === PlayerStatus.AVAILABLE && !match.teamA.includes(p.id) && !match.teamB.includes(p.id)
      )!;
      
      useStore.getState().swapPlayerInMatch(match.id, oldPlayerId, availablePlayer.id);
      
      const state = useStore.getState();
      const updatedMatch = state.matches[0];
      expect(updatedMatch.teamA).toContain(availablePlayer.id);
      expect(updatedMatch.teamA).not.toContain(oldPlayerId);
      expect(state.players.find(p => p.id === oldPlayerId)!.status).toBe(PlayerStatus.AVAILABLE);
      expect(state.players.find(p => p.id === availablePlayer.id)!.status).toBe(PlayerStatus.PLAYING);
    });

    it('Test 54: Reject swap with player already in active match', () => {
      initSession('SwapReject', 2);
      addPlayers(12);
      
      const batch = useStore.getState().getUpcomingBatches();
      useStore.getState().startBatch(batch[0], 'c_1');
      if (batch.length > 1) {
        useStore.getState().startBatch(batch[1], 'c_2');
      }
      
      const match1 = useStore.getState().matches.find(m => m.courtId === 'c_1' && !m.endedAtEpochMs)!;
      const match2 = useStore.getState().matches.find(m => m.courtId === 'c_2' && !m.endedAtEpochMs);
      
      if (match2) {
        const oldId = match1.teamA[0];
        const conflictId = match2.teamA[0]; // Already playing!
        
        useStore.getState().swapPlayerInMatch(match1.id, oldId, conflictId);
        
        // Should be rejected — original player still in match
        const state = useStore.getState();
        const m1 = state.matches.find(m => m.id === match1.id)!;
        expect(m1.teamA).toContain(oldId);
      }
    });

    it('Test 55: Swap with 4-arg signature works', () => {
      initSession('Swap4', 2);
      addPlayers(8);
      const batch = useStore.getState().getUpcomingBatches();
      useStore.getState().startBatch(batch[0], 'c_1');
      
      const match = useStore.getState().matches[0];
      const oldPlayerId = match.teamB[1];
      const available = useStore.getState().players.find(
        p => p.status === PlayerStatus.AVAILABLE && !match.teamA.includes(p.id) && !match.teamB.includes(p.id)
      )!;
      
      // 4-arg call: (matchId, team, oldId, newId)
      useStore.getState().swapPlayerInMatch(match.id, Team.B, oldPlayerId, available.id);
      
      const state = useStore.getState();
      expect(state.matches[0].teamB).toContain(available.id);
      expect(state.matches[0].teamB).not.toContain(oldPlayerId);
    });

    it('Test 56: Swap on completed match is rejected', () => {
      initSession('SwapCompleted', 1);
      addPlayers(8);
      const batch = useStore.getState().getUpcomingBatches();
      useStore.getState().startBatch(batch[0], 'c_1');
      const match = useStore.getState().matches[0];
      useStore.getState().completeMatch(match.id, Team.A, 11, 9);
      
      const available = useStore.getState().players.find(
        p => p.status === PlayerStatus.AVAILABLE && !match.teamA.includes(p.id) && !match.teamB.includes(p.id)
      )!;
      
      useStore.getState().swapPlayerInMatch(match.id, match.teamA[0], available.id);
      // Should not change anything — match is already complete
      const state = useStore.getState();
      expect(state.matches[0].teamA).toContain(match.teamA[0]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 9: Winner Reversal (Tests 57-59)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 9: Winner Reversal', () => {
    it('Test 57: Reverse winner flips Team A → Team B', () => {
      initSession('Reverse', 1);
      addPlayers(4);
      const batch = useStore.getState().getUpcomingBatches();
      useStore.getState().startBatch(batch[0], 'c_1');
      const match = useStore.getState().matches[0];
      useStore.getState().completeMatch(match.id, Team.A, 11, 9);
      
      useStore.getState().reverseMatchWinner(match.id);
      
      const state = useStore.getState();
      expect(state.matches[0].winner).toBe(Team.B);
    });

    it('Test 58: Reverse winner updates stats correctly', () => {
      initSession('ReverseStats', 1);
      addPlayers(4);
      const batch = useStore.getState().getUpcomingBatches();
      useStore.getState().startBatch(batch[0], 'c_1');
      const match = useStore.getState().matches[0];
      useStore.getState().completeMatch(match.id, Team.A, 11, 9);
      
      // Team A had 1 win, Team B had 1 loss
      const teamAPlayerId = match.teamA[0];
      const teamBPlayerId = match.teamB[0];
      
      useStore.getState().reverseMatchWinner(match.id);
      
      const state = useStore.getState();
      // Team A now has 0 wins, 1 loss
      expect(state.players.find(p => p.id === teamAPlayerId)!.sessionWins).toBe(0);
      expect(state.players.find(p => p.id === teamAPlayerId)!.sessionLosses).toBe(1);
      // Team B now has 1 win, 0 losses
      expect(state.players.find(p => p.id === teamBPlayerId)!.sessionWins).toBe(1);
      expect(state.players.find(p => p.id === teamBPlayerId)!.sessionLosses).toBe(0);
    });

    it('Test 59: Reverse winner on match with no winner does nothing', () => {
      initSession('NoWinner', 1);
      addPlayers(4);
      const batch = useStore.getState().getUpcomingBatches();
      useStore.getState().startBatch(batch[0], 'c_1');
      const match = useStore.getState().matches[0];
      // Do NOT complete — winner is null
      useStore.getState().reverseMatchWinner(match.id);
      expect(useStore.getState().matches[0].winner).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 10: End Session & History (Tests 60-63)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 10: End Session & History', () => {
    it('Test 60: End session clears active state', () => {
      initSession('EndMe', 2);
      addPlayers(8);
      useStore.getState().endSession();
      const state = useStore.getState();
      expect(state.session).toBeNull();
      expect(state.players).toHaveLength(0);
      expect(state.courts).toHaveLength(0);
      expect(state.matches).toHaveLength(0);
    });

    it('Test 61: End session saves to history', () => {
      initSession('HistorySave', 2);
      addPlayers(4);
      useStore.getState().endSession();
      const state = useStore.getState();
      expect(state.sessionHistory).toHaveLength(1);
      expect(state.sessionHistory[0].session.name).toBe('HistorySave');
    });

    it('Test 62: Multiple sessions accumulate in history', () => {
      for (let i = 0; i < 5; i++) {
        useStore.setState({ session: null, sessionId: null, joinCode: null, courts: [], players: [], matches: [] });
        initSession(`Session${i}`, 2);
        addPlayers(4, [1, 5], `S${i}`);
        useStore.getState().endSession();
      }
      expect(useStore.getState().sessionHistory).toHaveLength(5);
    });

    it('Test 63: Clear history empties session history', () => {
      initSession('ClearMe', 1);
      useStore.getState().endSession();
      expect(useStore.getState().sessionHistory.length).toBeGreaterThan(0);
      useStore.getState().clearHistory();
      expect(useStore.getState().sessionHistory).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 11: Multi-Round Tournament Simulation (Tests 64-67)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 11: Multi-Round Tournament Simulation', () => {
    it('Test 64: 16 players, 2 courts, 20 rounds — zero duplicate entries', () => {
      initSession('Tournament16', 2);
      addPlayers(16);
      
      for (let round = 0; round < 20; round++) {
        const state = useStore.getState();
        const openCourts = state.courts.filter(c => c.status === CourtStatus.OPEN);
        if (openCourts.length === 0) {
          completeAllActive();
          continue;
        }
        
        const batches = useStore.getState().getUpcomingBatches();
        for (let i = 0; i < Math.min(batches.length, openCourts.length); i++) {
          useStore.getState().startBatch(batches[i], openCourts[i].id);
        }
        
        // Verify no player appears in multiple active matches
        const activeMatches = useStore.getState().matches.filter(m => !m.endedAtEpochMs);
        const ids: string[] = [];
        activeMatches.forEach(m => ids.push(...m.teamA, ...m.teamB));
        expect(new Set(ids).size).toBe(ids.length);
        
        completeAllActive(round % 2 === 0 ? Team.A : Team.B);
      }
      
      const state = useStore.getState();
      const completedMatches = state.matches.filter(m => m.endedAtEpochMs != null);
      expect(completedMatches.length).toBeGreaterThan(0);
    });

    it('Test 65: 32 players, 4 courts, 30 rounds — fair distribution', () => {
      initSession('Tournament32', 4);
      addPlayers(32);
      
      for (let round = 0; round < 30; round++) {
        const openCourts = useStore.getState().courts.filter(c => c.status === CourtStatus.OPEN);
        const batches = useStore.getState().getUpcomingBatches();
        for (let i = 0; i < Math.min(batches.length, openCourts.length); i++) {
          useStore.getState().startBatch(batches[i], openCourts[i].id);
        }
        completeAllActive(round % 3 === 0 ? Team.B : Team.A);
      }
      
      const state = useStore.getState();
      const gamesPlayed = state.players.map(p => p.sessionGamesPlayed);
      const min = Math.min(...gamesPlayed);
      const max = Math.max(...gamesPlayed);
      // Fairness: no player should have more than 4x difference from the least-played
      expect(max - min).toBeLessThanOrEqual(Math.max(4, Math.ceil(max * 0.4)));
    });

    it('Test 66: 8 players, 1 court, 50 rounds — everyone plays', () => {
      initSession('Single50', 1);
      addPlayers(8);
      
      for (let round = 0; round < 50; round++) {
        const batches = useStore.getState().getUpcomingBatches();
        if (batches.length === 0) continue;
        useStore.getState().startBatch(batches[0], 'c_1');
        completeAllActive(round % 2 === 0 ? Team.A : Team.B);
      }
      
      const state = useStore.getState();
      // After 50 rounds with 8 players and 1 court, EVERY player should have played
      state.players.forEach(p => {
        expect(p.sessionGamesPlayed).toBeGreaterThan(0);
      });
    });

    it('Test 67: 48 players, 8 courts, 25 rounds — massive simulation', () => {
      initSession('Massive', 8);
      addPlayers(48);
      
      for (let round = 0; round < 25; round++) {
        const openCourts = useStore.getState().courts.filter(c => c.status === CourtStatus.OPEN);
        const batches = useStore.getState().getUpcomingBatches();
        for (let i = 0; i < Math.min(batches.length, openCourts.length); i++) {
          useStore.getState().startBatch(batches[i], openCourts[i].id);
        }
        
        // Check no duplicate players across active matches
        const active = useStore.getState().matches.filter(m => !m.endedAtEpochMs);
        const allIds: string[] = [];
        active.forEach(m => allIds.push(...m.teamA, ...m.teamB));
        expect(new Set(allIds).size).toBe(allIds.length);
        
        completeAllActive();
      }
      
      const state = useStore.getState();
      expect(state.matches.filter(m => m.endedAtEpochMs != null).length).toBeGreaterThan(50);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 12: Roster Persistence & Owner Isolation (Tests 68-71)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 12: Roster Persistence & Owner Isolation', () => {
    it('Test 68: Players are saved to roster after addPlayer', () => {
      initSession('RosterSave', 2);
      addPlayers(3);
      const state = useStore.getState();
      expect(state.roster.length).toBeGreaterThanOrEqual(3);
    });

    it('Test 69: Guest user does not save to rostersByOwner', () => {
      useStore.getState().setCurrentUser({ email: 'guest@', id: 'guest_abc' });
      useStore.getState().initializeSession('Guest', 2);
      const store = useStore.getState();
      store.addPlayer(mkPlayer('g1', 'GuestPlayer', 3));
      const state = useStore.getState();
      expect(state.rostersByOwner['guest_abc']).toBeUndefined();
    });

    it('Test 70: Switching user clears session if different owner', () => {
      initSession('UserA', 2);
      addPlayers(4);
      // Switch to different user
      useStore.getState().setCurrentUser({ email: 'b@test.com', id: 'organizer_2' });
      const state = useStore.getState();
      expect(state.session).toBeNull();
      expect(state.players).toHaveLength(0);
    });

    it('Test 71: Roster merge preserves max all-time stats', () => {
      initSession('Merge', 2);
      const store = useStore.getState();
      const player = mkPlayer('m1', 'Merger', 3, PlayerStatus.AVAILABLE, {
        allTimeWins: 10, allTimeLosses: 5, allTimeGamesPlayed: 15
      });
      store.addPlayer(player);
      
      // Save same player again with lower stats (simulating quick-add)
      const playerLow = mkPlayer('m1b', 'Merger', 3, PlayerStatus.AVAILABLE, {
        allTimeWins: 0, allTimeLosses: 0, allTimeGamesPlayed: 0
      });
      store.saveToRoster(playerLow);
      
      const state = useStore.getState();
      const rosterPlayer = state.roster.find(r => r.name.toLowerCase() === 'merger');
      expect(rosterPlayer!.allTimeWins).toBe(10);
      expect(rosterPlayer!.allTimeLosses).toBe(5);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 13: Pairing Quality & Variety (Tests 72-76)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 13: Pairing Quality & Variety', () => {
    it('Test 72: pairFour with equal skills produces balanced teams', () => {
      const players = [
        mkPlayer('e1', 'E1', 3),
        mkPlayer('e2', 'E2', 3),
        mkPlayer('e3', 'E3', 3),
        mkPlayer('e4', 'E4', 3),
      ];
      const match = pairFour(players);
      const skillA = match.teamA.reduce((s, p) => s + p.skillLevel, 0);
      const skillB = match.teamB.reduce((s, p) => s + p.skillLevel, 0);
      expect(Math.abs(skillA - skillB)).toBeLessThanOrEqual(1);
    });

    it('Test 73: pairFour with mixed skills tries to balance', () => {
      const players = [
        mkPlayer('m1', 'M1', 4),
        mkPlayer('m2', 'M2', 4),
        mkPlayer('m3', 'M3', 3),
        mkPlayer('m4', 'M4', 3),
      ];
      const match = pairFour(players);
      const skillA = match.teamA.reduce((s, p) => s + p.skillLevel, 0);
      const skillB = match.teamB.reduce((s, p) => s + p.skillLevel, 0);
      expect(Math.abs(skillA - skillB)).toBeLessThanOrEqual(1);
    });

    it('Test 74: scoreMatch penalizes recent partner repeat', () => {
      const p1 = mkPlayer('s1', 'S1', 3, PlayerStatus.AVAILABLE, { recentPartnerIds: ['s2'] });
      const p2 = mkPlayer('s2', 'S2', 3, PlayerStatus.AVAILABLE, { recentPartnerIds: ['s1'] });
      const p3 = mkPlayer('s3', 'S3', 3);
      const p4 = mkPlayer('s4', 'S4', 3);
      
      const repeatMatch: ProposedMatch = { teamA: [p1, p2], teamB: [p3, p4] };
      const freshMatch: ProposedMatch = { teamA: [p1, p3], teamB: [p2, p4] };
      
      expect(scoreMatch(repeatMatch)).toBeGreaterThan(scoreMatch(freshMatch));
    });

    it('Test 75: pairFour with 2 players returns partial result', () => {
      const players = [mkPlayer('x1', 'X1', 3), mkPlayer('x2', 'X2', 3)];
      const match = pairFour(players);
      expect(match.teamA.length + match.teamB.length).toBe(2);
    });

    it('Test 76: L4+ vs L2- pairing is heavily penalized', () => {
      const p1 = mkPlayer('h1', 'H1', 5);
      const p2 = mkPlayer('h2', 'H2', 1);
      const p3 = mkPlayer('h3', 'H3', 3);
      const p4 = mkPlayer('h4', 'H4', 3);
      
      const badMatch: ProposedMatch = { teamA: [p1, p2], teamB: [p3, p4] };
      expect(scoreMatch(badMatch)).toBeGreaterThanOrEqual(1000000);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 14: Edge Cases & Stress (Tests 77-82)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 14: Edge Cases & Stress', () => {
    it('Test 77: RESTING players are not queued', () => {
      const players = [
        mkPlayer('r1', 'R1', 3, PlayerStatus.RESTING),
        mkPlayer('r2', 'R2', 3, PlayerStatus.RESTING),
        mkPlayer('r3', 'R3', 3, PlayerStatus.AVAILABLE),
        mkPlayer('r4', 'R4', 3, PlayerStatus.AVAILABLE),
        mkPlayer('r5', 'R5', 3, PlayerStatus.AVAILABLE),
        mkPlayer('r6', 'R6', 3, PlayerStatus.AVAILABLE),
      ];
      const batches = buildNextBatches(players, 2);
      expect(batches).toHaveLength(1);
      const ids = batches[0].map(p => p.id);
      expect(ids).not.toContain('r1');
      expect(ids).not.toContain('r2');
    });

    it('Test 78: CHECKED_OUT players are excluded', () => {
      const players = [
        mkPlayer('co1', 'CO1', 3, PlayerStatus.CHECKED_OUT),
        ...Array.from({ length: 4 }, (_, i) => mkPlayer(`av${i}`, `AV${i}`, 3)),
      ];
      const batches = buildNextBatches(players, 1);
      expect(batches).toHaveLength(1);
      expect(batches[0].map(p => p.id)).not.toContain('co1');
    });

    it('Test 79: All players resting → no batches', () => {
      const players = Array.from({ length: 8 }, (_, i) => mkPlayer(`rest${i}`, `Rest${i}`, 3, PlayerStatus.RESTING));
      const batches = buildNextBatches(players, 2);
      expect(batches).toHaveLength(0);
    });

    it('Test 80: Complete match on non-existent match ID does nothing', () => {
      initSession('NonExist', 2);
      addPlayers(4);
      useStore.getState().completeMatch('non_existent', Team.A, 11, 9);
      const state = useStore.getState();
      // No matches should exist
      expect(state.matches).toHaveLength(0);
    });

    it('Test 81: Rapid-fire 100 match cycles on single court', () => {
      initSession('RapidFire', 1);
      addPlayers(12);
      
      for (let i = 0; i < 100; i++) {
        const batches = useStore.getState().getUpcomingBatches();
        if (batches.length === 0) continue;
        useStore.getState().startBatch(batches[0], 'c_1');
        const match = useStore.getState().matches.find(m => !m.endedAtEpochMs);
        if (match) {
          useStore.getState().completeMatch(match.id, i % 2 === 0 ? Team.A : Team.B, 11, i % 10);
        }
      }
      
      const state = useStore.getState();
      const completed = state.matches.filter(m => m.endedAtEpochMs != null);
      expect(completed.length).toBe(100);
      
      // All players should be AVAILABLE at the end
      state.players.forEach(p => {
        expect(p.status).toBe(PlayerStatus.AVAILABLE);
        expect(p.currentCourtId).toBeNull();
      });
    });

    it('Test 82: Player with currentCourtId set is excluded from new batches', () => {
      const players = [
        mkPlayer('oc1', 'OC1', 3, PlayerStatus.AVAILABLE, { currentCourtId: 'c_1' }),
        ...Array.from({ length: 4 }, (_, i) => mkPlayer(`free${i}`, `Free${i}`, 3)),
      ];
      const batches = buildNextBatches(players, 1);
      expect(batches).toHaveLength(1);
      expect(batches[0].map(p => p.id)).not.toContain('oc1');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 15: Concurrent Viewer Simulation (Tests 83-86)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 15: Concurrent Viewer Simulation', () => {
    it('Test 83: Simulated player view reads state correctly', () => {
      initSession('Viewer', 2);
      addPlayers(12);
      
      // Start matches
      const batches = useStore.getState().getUpcomingBatches();
      useStore.getState().startBatch(batches[0], 'c_1');
      
      // Simulate player view reading
      const state = useStore.getState();
      const activeCourts = state.courts.filter(c => c.status === CourtStatus.IN_PROGRESS);
      expect(activeCourts).toHaveLength(1);
      
      const queuedPlayers = state.players.filter(p => p.status === PlayerStatus.AVAILABLE);
      const playingPlayers = state.players.filter(p => p.status === PlayerStatus.PLAYING);
      expect(playingPlayers).toHaveLength(4);
      expect(queuedPlayers.length + playingPlayers.length).toBe(12);
    });

    it('Test 84: 20 concurrent viewer reads during active match', () => {
      initSession('ConcurrentReads', 3);
      addPlayers(16);
      
      const batches = useStore.getState().getUpcomingBatches();
      for (let i = 0; i < Math.min(batches.length, 3); i++) {
        useStore.getState().startBatch(batches[i], `c_${i + 1}`);
      }
      
      // Simulate 20 concurrent reads
      for (let viewer = 0; viewer < 20; viewer++) {
        const state = useStore.getState();
        const playing = state.players.filter(p => p.status === PlayerStatus.PLAYING);
        const available = state.players.filter(p => p.status === PlayerStatus.AVAILABLE);
        
        // All reads should see consistent state
        expect(playing.length + available.length).toBe(16);
        
        // No player should be in two states
        const playingIds = new Set(playing.map(p => p.id));
        available.forEach(p => {
          expect(playingIds.has(p.id)).toBe(false);
        });
      }
    });

    it('Test 85: Player view batches exclude active players', () => {
      initSession('ViewerBatches', 2);
      addPlayers(12);
      
      const batches = useStore.getState().getUpcomingBatches();
      useStore.getState().startBatch(batches[0], 'c_1');
      
      const state = useStore.getState();
      const activeMatches = state.matches.filter(m => !m.endedAtEpochMs);
      const activePlayerIds = new Set(activeMatches.flatMap(m => [...m.teamA, ...m.teamB]));
      
      // Simulate player view computing upcoming
      const upcomingBatches = useStore.getState().getUpcomingBatches();
      upcomingBatches.forEach(batch => {
        [...batch.teamA, ...batch.teamB].forEach(p => {
          expect(activePlayerIds.has(p.id)).toBe(false);
        });
      });
    });

    it('Test 86: State consistency after complete-then-start cycle', () => {
      initSession('Cycle', 2);
      addPlayers(12);
      
      // Run 5 full cycles
      for (let cycle = 0; cycle < 5; cycle++) {
        const batches = useStore.getState().getUpcomingBatches();
        const courts = useStore.getState().courts.filter(c => c.status === CourtStatus.OPEN);
        
        for (let i = 0; i < Math.min(batches.length, courts.length); i++) {
          useStore.getState().startBatch(batches[i], courts[i].id);
        }
        
        completeAllActive(cycle % 2 === 0 ? Team.A : Team.B);
        
        // After completing all, verify all players are AVAILABLE
        const state = useStore.getState();
        state.players.forEach(p => {
          expect(p.status).toBe(PlayerStatus.AVAILABLE);
          expect(p.currentCourtId).toBeNull();
        });
        
        // All courts should be OPEN
        state.courts.forEach(c => {
          expect(c.status).toBe(CourtStatus.OPEN);
          expect(c.currentMatchId).toBeNull();
        });
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 16: TTS & Announcements (Tests 87-88)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('Section 16: TTS & Announcements', () => {
    it('Test 87: TTS settings can be toggled', () => {
      useStore.getState().setTTSEnabled(true);
      expect(useStore.getState().ttsEnabled).toBe(true);
      useStore.getState().setTTSEnabled(false);
      expect(useStore.getState().ttsEnabled).toBe(false);
    });

    it('Test 88: Broadcast announcement updates session', () => {
      initSession('Announce', 2);
      useStore.getState().broadcastAnnouncement('Court 1 is ready!');
      const state = useStore.getState();
      expect(state.session!.currentAnnouncement).toBe('Court 1 is ready!');
      expect(state.session!.announcementTimestamp).toBeGreaterThan(0);
    });
  });
});

// Helper function for test 48
function matchPlayers(set: Set<string>, id: string): boolean {
  return set.has(id);
}
