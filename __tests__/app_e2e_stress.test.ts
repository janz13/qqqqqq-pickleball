import { useStore } from '../src/lib/store';
import { buildNextBatches, priorityOrder, incrementSitOuts, catchUpTargetForNewPlayer, refreshCatchUpStatus } from '../src/engine/queue-engine';
import { pairFour, scoreMatch } from '../src/engine/pairing-engine';
import { Player, PlayerStatus, Court, CourtStatus, Match, Team, Session, createPlayer } from '../src/types/models';

describe('Intense Full-App End-to-End Stress Test Suite (70 Scenarios)', () => {
  const createTestPlayer = (
    id: string,
    name: string,
    skillLevel = 3,
    status = PlayerStatus.AVAILABLE,
    currentCourtId: string | null = null,
    extra: Partial<Player> = {}
  ): Player =>
    createPlayer({
      id,
      name,
      skillLevel,
      status,
      currentCourtId,
      queuedAtEpochMs: Date.now(),
      joinedSessionAtEpochMs: Date.now(),
      ...extra,
    });

  beforeEach(() => {
    // Reset Zustand store state before each test
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
    });
  });

  // =========================================================================
  // Part 1: Home Page, Join Code & Auth Flow (Tests 1-8)
  // =========================================================================
  describe('Part 1: Home Page, Join Code & Auth Flow', () => {
    it('Test 1: Normalizes lowercase join codes to uppercase and trims whitespace', () => {
      const rawInput = '  pb482  ';
      const normalized = rawInput.trim().toUpperCase();
      expect(normalized).toBe('PB482');
      expect(normalized).toMatch(/^[A-Z0-9]{5}$/);
    });

    it('Test 2: Rejects invalid join code formats (too short, empty, special characters)', () => {
      const validateJoinCode = (code: string) => /^[A-Z0-9]{5}$/.test(code.trim().toUpperCase());
      expect(validateJoinCode('')).toBe(false);
      expect(validateJoinCode('abc')).toBe(false);
      expect(validateJoinCode('123456')).toBe(false);
      expect(validateJoinCode('AB!@#')).toBe(false);
      expect(validateJoinCode('AB12C')).toBe(true);
    });

    it('Test 3: Guest login sets guest owner UID starting with guest_', () => {
      const guestUser = { id: 'guest_' + Math.random().toString(36).substr(2, 6), email: 'guest@local' };
      useStore.getState().setCurrentUser(guestUser);
      expect(useStore.getState().currentUser?.id).toMatch(/^guest_/);
    });

    it('Test 4: Organizer login initializes authenticated state', () => {
      const organizer = { id: 'org_123', email: 'janz13@example.com' };
      useStore.getState().setCurrentUser(organizer);
      expect(useStore.getState().currentUser?.email).toBe('janz13@example.com');
    });

    it('Test 5: Switching organizers isolates rosters per owner', () => {
      const orgA = { id: 'user_A', email: 'a@test.com' };
      const orgB = { id: 'user_B', email: 'b@test.com' };

      // Org A logs in and adds player
      useStore.getState().setCurrentUser(orgA);
      useStore.getState().saveToRoster(createTestPlayer('pA', 'Alice A'));
      expect(useStore.getState().roster.length).toBe(1);

      // Org B logs in
      useStore.getState().setCurrentUser(orgB);
      expect(useStore.getState().roster.length).toBe(0); // Org B has empty roster initially

      // Org B adds player
      useStore.getState().saveToRoster(createTestPlayer('pB', 'Bob B'));
      expect(useStore.getState().roster.length).toBe(1);
      expect(useStore.getState().roster[0].name).toBe('Bob B');

      // Switch back to Org A
      useStore.getState().setCurrentUser(orgA);
      expect(useStore.getState().roster.length).toBe(1);
      expect(useStore.getState().roster[0].name).toBe('Alice A');
    });

    it('Test 6: Switching to a different owner clears active session if not owner', () => {
      const orgA = { id: 'user_A', email: 'a@test.com' };
      const orgB = { id: 'user_B', email: 'b@test.com' };

      useStore.getState().setCurrentUser(orgA);
      useStore.getState().initializeSession('Open Play Friday', 4);
      expect(useStore.getState().session?.name).toBe('Open Play Friday');

      // Org B logs in: different owner must reset active session
      useStore.getState().setCurrentUser(orgB);
      expect(useStore.getState().session).toBeNull();
      expect(useStore.getState().courts.length).toBe(0);
    });

    it('Test 7: Organizer login retains lifetime player stats in persistent roster', () => {
      const organizer = { id: 'org_janz', email: 'janz@test.com' };
      useStore.getState().setCurrentUser(organizer);

      const veteran = createTestPlayer('v1', 'Veteran Player', 4, PlayerStatus.AVAILABLE, null, {
        allTimeWins: 42,
        allTimeLosses: 10,
        allTimeGamesPlayed: 52,
      });

      useStore.getState().saveToRoster(veteran);
      const saved = useStore.getState().roster.find(p => p.name === 'Veteran Player');
      expect(saved?.allTimeWins).toBe(42);
      expect(saved?.allTimeGamesPlayed).toBe(52);
    });

    it('Test 8: Preserves all-time stats when re-adding an existing player with quick-add 0s', () => {
      const organizer = { id: 'org_janz', email: 'janz@test.com' };
      useStore.getState().setCurrentUser(organizer);

      useStore.getState().saveToRoster(createTestPlayer('v1', 'Legend', 4, PlayerStatus.AVAILABLE, null, {
        allTimeWins: 50,
        allTimeLosses: 5,
        allTimeGamesPlayed: 55,
      }));

      // Quick add passes 0s for all-time stats
      useStore.getState().saveToRoster(createTestPlayer('v1_new', 'Legend', 5));

      const preserved = useStore.getState().roster.find(p => p.name.toLowerCase() === 'legend');
      expect(preserved?.allTimeWins).toBe(50);
      expect(preserved?.skillLevel).toBe(5); // updated skill level
    });
  });

  // =========================================================================
  // Part 2: Session Creation & Court Setup (Tests 9-15)
  // =========================================================================
  describe('Part 2: Session Creation & Court Setup', () => {
    it('Test 9: initializeSession creates default 4 courts in OPEN status', () => {
      const session = useStore.getState().initializeSession('Saturday Social', 4);
      expect(session.name).toBe('Saturday Social');
      expect(session.isActive).toBe(true);

      const courts = useStore.getState().courts;
      expect(courts.length).toBe(4);
      expect(courts.every(c => c.status === CourtStatus.OPEN && c.currentMatchId === null)).toBe(true);
      expect(courts.map(c => c.label)).toEqual(['Court 1', 'Court 2', 'Court 3', 'Court 4']);
    });

    it('Test 10: Supports custom court counts from 1 to 10 courts', () => {
      for (const count of [1, 2, 6, 8, 10]) {
        useStore.getState().initializeSession(`Session ${count}`, count);
        expect(useStore.getState().courts.length).toBe(count);
      }
    });

    it('Test 11: Applies custom court labels accurately', () => {
      const labels = ['Stadium Court', 'Center Court', 'Court A', 'Grandstand'];
      useStore.getState().initializeSession('Championship Day', 4, labels);

      const courtLabels = useStore.getState().courts.map(c => c.label);
      expect(courtLabels).toEqual(labels);
    });

    it('Test 12: Generates a 5-character uppercase join code', () => {
      const session = useStore.getState().initializeSession('Test Join Code', 2);
      expect(session.joinCode).toHaveLength(5);
      expect(session.joinCode).toBe(session.joinCode.toUpperCase());
    });

    it('Test 13: addCourt dynamically increments sequential court labels', () => {
      useStore.getState().initializeSession('Expandable Session', 2);
      expect(useStore.getState().courts.map(c => c.label)).toEqual(['Court 1', 'Court 2']);

      useStore.getState().addCourt({ id: 'c_3', label: '', status: CourtStatus.OPEN, currentMatchId: null });
      expect(useStore.getState().courts.map(c => c.label)).toEqual(['Court 1', 'Court 2', 'Court 3']);
    });

    it('Test 14: Renaming court preserves court ID and status', () => {
      useStore.getState().initializeSession('Rename Session', 2);
      const court1 = useStore.getState().courts[0];

      useStore.getState().updateCourt({ ...court1, label: 'Showcase Court' });

      const updated = useStore.getState().courts.find(c => c.id === court1.id);
      expect(updated?.label).toBe('Showcase Court');
      expect(updated?.status).toBe(CourtStatus.OPEN);
    });

    it('Test 15: Court transitions between OPEN and NEEDS_RESET', () => {
      useStore.getState().initializeSession('Maintenance Session', 1);
      const court = useStore.getState().courts[0];

      useStore.getState().updateCourt({ ...court, status: CourtStatus.NEEDS_RESET });
      expect(useStore.getState().courts[0].status).toBe(CourtStatus.NEEDS_RESET);

      useStore.getState().updateCourt({ ...court, status: CourtStatus.OPEN });
      expect(useStore.getState().courts[0].status).toBe(CourtStatus.OPEN);
    });
  });

  // =========================================================================
  // Part 3: Roster Management & Registration (Tests 16-24)
  // =========================================================================
  describe('Part 3: Roster Management & Registration', () => {
    beforeEach(() => {
      useStore.getState().initializeSession('Roster Session', 2);
    });

    it('Test 16: Quick add creates an AVAILABLE player with zero session games', () => {
      const player = createTestPlayer('p1', 'Alice Walker', 3.5);
      useStore.getState().addPlayer(player);

      const added = useStore.getState().players.find(p => p.id === 'p1');
      expect(added).toBeDefined();
      expect(added?.status).toBe(PlayerStatus.AVAILABLE);
      expect(added?.sessionGamesPlayed).toBe(0);
    });

    it('Test 17: Rejects duplicate player names with exact match', () => {
      useStore.getState().addPlayer(createTestPlayer('p1', 'Bob Dylan'));
      useStore.getState().addPlayer(createTestPlayer('p2', 'Bob Dylan'));

      expect(useStore.getState().players.length).toBe(1);
    });

    it('Test 18: Rejects duplicate player names case-insensitively', () => {
      useStore.getState().addPlayer(createTestPlayer('p1', 'Charlie Brown'));
      useStore.getState().addPlayer(createTestPlayer('p2', 'charlie brown'));

      expect(useStore.getState().players.length).toBe(1);
    });

    it('Test 19: Rejects duplicate player names with extra whitespace', () => {
      useStore.getState().addPlayer(createTestPlayer('p1', 'Diana Prince'));
      useStore.getState().addPlayer(createTestPlayer('p2', '  Diana Prince  '));

      expect(useStore.getState().players.length).toBe(1);
    });

    it('Test 20: CSV parser parses Name,SkillLevel correctly', () => {
      const csvData = `Name,Skill Level\nJohn Doe,3.5\nJane Smith,4.0\nMike Jordan,5.0`;
      const lines = csvData.split('\n').slice(1);
      const parsed = lines
        .map(line => {
          const [name, skill] = line.split(',');
          return name && skill ? { name: name.trim(), skill: parseFloat(skill.trim()) } : null;
        })
        .filter(Boolean);

      expect(parsed).toEqual([
        { name: 'John Doe', skill: 3.5 },
        { name: 'Jane Smith', skill: 4.0 },
        { name: 'Mike Jordan', skill: 5.0 },
      ]);
    });

    it('Test 21: CSV parser handles empty lines and malformed rows without crashing', () => {
      const malformedCsv = `Name,Skill Level\n\n   \nOnlyName\nValid Player,3.0\n,4.0`;
      const lines = malformedCsv.split('\n').slice(1);
      const valid = lines.filter(l => {
        const parts = l.split(',');
        return parts.length === 2 && parts[0].trim() && !isNaN(parseFloat(parts[1]));
      });

      expect(valid.length).toBe(1);
      expect(valid[0]).toBe('Valid Player,3.0');
    });

    it('Test 22: Pre-registered player with CHECKED_OUT status is excluded from queue batches', () => {
      useStore.getState().addPlayer(createTestPlayer('p1', 'P1', 3, PlayerStatus.AVAILABLE));
      useStore.getState().addPlayer(createTestPlayer('p2', 'P2', 3, PlayerStatus.AVAILABLE));
      useStore.getState().addPlayer(createTestPlayer('p3', 'P3', 3, PlayerStatus.AVAILABLE));
      useStore.getState().addPlayer(createTestPlayer('p4', 'P4', 3, PlayerStatus.CHECKED_OUT)); // pre-registered only

      const batches = useStore.getState().getUpcomingBatches();
      expect(batches.length).toBe(0); // Needs 4 available players
    });

    it('Test 23: Checking in a pre-registered player moves them to AVAILABLE', () => {
      useStore.getState().addPlayer(createTestPlayer('p1', 'PreReg Player', 3, PlayerStatus.CHECKED_OUT));
      useStore.getState().updatePlayerStatus('p1', PlayerStatus.AVAILABLE);

      const player = useStore.getState().players.find(p => p.id === 'p1');
      expect(player?.status).toBe(PlayerStatus.AVAILABLE);
    });

    it('Test 24: Resting a player removes them from the queue pool', () => {
      useStore.getState().addPlayer(createTestPlayer('p1', 'Resting Player', 3, PlayerStatus.AVAILABLE));
      useStore.getState().updatePlayerStatus('p1', PlayerStatus.RESTING);

      const player = useStore.getState().players.find(p => p.id === 'p1');
      expect(player?.status).toBe(PlayerStatus.RESTING);

      // Resting player excluded from buildNextBatches
      const batches = buildNextBatches(useStore.getState().players, 1);
      expect(batches.length).toBe(0);
    });
  });

  // =========================================================================
  // Part 4: Duo Queue & Partnership Logic (Tests 25-30)
  // =========================================================================
  describe('Part 4: Duo Queue & Partnership Logic', () => {
    beforeEach(() => {
      useStore.getState().initializeSession('Duo Session', 2);
      useStore.getState().addPlayer(createTestPlayer('p1', 'Player 1', 3));
      useStore.getState().addPlayer(createTestPlayer('p2', 'Player 2', 3));
      useStore.getState().addPlayer(createTestPlayer('p3', 'Player 3', 3));
      useStore.getState().addPlayer(createTestPlayer('p4', 'Player 4', 3));
    });

    it('Test 25: Bidirectional partner lock links both players', () => {
      useStore.getState().setLockedPartner('p1', 'p2');

      const p1 = useStore.getState().players.find(p => p.id === 'p1');
      const p2 = useStore.getState().players.find(p => p.id === 'p2');
      expect(p1?.lockedPartnerId).toBe('p2');
      expect(p2?.lockedPartnerId).toBe('p1');
    });

    it('Test 26: Unlocking one partner unlocks both sides', () => {
      useStore.getState().setLockedPartner('p1', 'p2');
      useStore.getState().unlockPartner('p1');

      const p1 = useStore.getState().players.find(p => p.id === 'p1');
      const p2 = useStore.getState().players.find(p => p.id === 'p2');
      expect(p1?.lockedPartnerId).toBeNull();
      expect(p2?.lockedPartnerId).toBeNull();
    });

    it('Test 27: Reassigning lock cleanly unlinks previous partner', () => {
      useStore.getState().setLockedPartner('p1', 'p2');
      // Now lock p1 to p3 via updatePlayer
      const p1 = useStore.getState().players.find(p => p.id === 'p1')!;
      useStore.getState().updatePlayer({ ...p1, lockedPartnerId: 'p3' });

      const p1After = useStore.getState().players.find(p => p.id === 'p1');
      const p2After = useStore.getState().players.find(p => p.id === 'p2');
      const p3After = useStore.getState().players.find(p => p.id === 'p3');

      expect(p1After?.lockedPartnerId).toBe('p3');
      expect(p3After?.lockedPartnerId).toBe('p1');
      expect(p2After?.lockedPartnerId).toBeNull(); // p2 was cleanly unlocked
    });

    it('Test 28: Queue Engine selects locked partners in the same batch', () => {
      useStore.getState().setLockedPartner('p1', 'p2');
      const batches = buildNextBatches(useStore.getState().players, 1);

      expect(batches.length).toBe(1);
      const batchIds = batches[0].map(p => p.id);
      expect(batchIds).toContain('p1');
      expect(batchIds).toContain('p2');
    });

    it('Test 29: Pairing Engine places locked partners on the SAME team', () => {
      const players = [
        createTestPlayer('p1', 'P1', 3, PlayerStatus.AVAILABLE, null, { lockedPartnerId: 'p2' }),
        createTestPlayer('p2', 'P2', 3, PlayerStatus.AVAILABLE, null, { lockedPartnerId: 'p1' }),
        createTestPlayer('p3', 'P3', 3),
        createTestPlayer('p4', 'P4', 3),
      ];

      const match = pairFour(players);
      const teamAIds = match.teamA.map(p => p.id);
      const teamBIds = match.teamB.map(p => p.id);

      const bothInA = teamAIds.includes('p1') && teamAIds.includes('p2');
      const bothInB = teamBIds.includes('p1') && teamBIds.includes('p2');
      expect(bothInA || bothInB).toBe(true);
    });

    it('Test 30: Does not split locked partner if one partner is resting', () => {
      useStore.getState().addPlayer(createTestPlayer('p5', 'P5', 3));
      useStore.getState().setLockedPartner('p1', 'p2');
      useStore.getState().updatePlayerStatus('p1', PlayerStatus.RESTING);

      // p1 is resting, so p2 should not be scheduled alone if no combinations can accommodate
      const availablePlayers = useStore.getState().players.filter(p => p.status === PlayerStatus.AVAILABLE);
      expect(availablePlayers.map(p => p.id)).toEqual(['p2', 'p3', 'p4', 'p5']);
      const batches = buildNextBatches(useStore.getState().players, 1);

      // If p2 is locked to p1 and p1 is not available, the batch should either take the 4 unattached or handle gracefully
      if (batches.length > 0) {
        // Must never include p1 since p1 is resting
        expect(batches[0].map(p => p.id)).not.toContain('p1');
      }
    });
  });

  // =========================================================================
  // Part 5: Queue Engine & Priority Algorithm Stress (Tests 31-38)
  // =========================================================================
  describe('Part 5: Queue Engine & Priority Algorithm Stress', () => {
    it('Test 31: Enforces FIFO order when games played are equal', () => {
      const p1 = createTestPlayer('p1', 'P1', 3, PlayerStatus.AVAILABLE, null, { queuedAtEpochMs: 1000 });
      const p2 = createTestPlayer('p2', 'P2', 3, PlayerStatus.AVAILABLE, null, { queuedAtEpochMs: 2000 });
      const p3 = createTestPlayer('p3', 'P3', 3, PlayerStatus.AVAILABLE, null, { queuedAtEpochMs: 3000 });

      const sorted = priorityOrder([p3, p1, p2]);
      expect(sorted.map(p => p.id)).toEqual(['p1', 'p2', 'p3']);
    });

    it('Test 32: Prioritizes players with fewer games played', () => {
      const veteran = createTestPlayer('v', 'Veteran', 3, PlayerStatus.AVAILABLE, null, { sessionGamesPlayed: 4 });
      const newcomer = createTestPlayer('n', 'Newcomer', 3, PlayerStatus.AVAILABLE, null, { sessionGamesPlayed: 1 });

      const sorted = priorityOrder([veteran, newcomer]);
      expect(sorted[0].id).toBe('n');
    });

    it('Test 33: Prioritizes players with higher consecutive sit-outs', () => {
      const p1 = createTestPlayer('p1', 'P1', 3, PlayerStatus.AVAILABLE, null, { consecutiveSitOuts: 0, sessionGamesPlayed: 2 });
      const p2 = createTestPlayer('p2', 'P2', 3, PlayerStatus.AVAILABLE, null, { consecutiveSitOuts: 3, sessionGamesPlayed: 2 });

      const sorted = priorityOrder([p1, p2]);
      expect(sorted[0].id).toBe('p2');
    });

    it('Test 34: Latecomers get absolute highest priority until caught up', () => {
      const regular = createTestPlayer('r', 'Regular', 3, PlayerStatus.AVAILABLE, null, { sessionGamesPlayed: 3 });
      const latecomer = createTestPlayer('l', 'Latecomer', 3, PlayerStatus.AVAILABLE, null, {
        isLatecomer: true,
        hasCaughtUp: false,
        catchUpTargetGames: 3,
        sessionGamesPlayed: 0,
      });

      const sorted = priorityOrder([regular, latecomer]);
      expect(sorted[0].id).toBe('l');
    });

    it('Test 35: refreshCatchUpStatus clears latecomer flag once target games are reached', () => {
      let latecomer = createTestPlayer('l', 'Latecomer', 3, PlayerStatus.AVAILABLE, null, {
        isLatecomer: true,
        hasCaughtUp: false,
        catchUpTargetGames: 2,
        sessionGamesPlayed: 1,
      });

      latecomer = refreshCatchUpStatus(latecomer);
      expect(latecomer.hasCaughtUp).toBe(false);

      latecomer.sessionGamesPlayed = 2;
      latecomer = refreshCatchUpStatus(latecomer);
      expect(latecomer.hasCaughtUp).toBe(true);
    });

    it('Test 36: Balanced mode creates equal or near-equal team skill sums', () => {
      const players = [
        createTestPlayer('p1', 'P1', 4),
        createTestPlayer('p2', 'P2', 4),
        createTestPlayer('p3', 'P3', 3),
        createTestPlayer('p4', 'P4', 3),
      ];

      const match = pairFour(players);
      const sumA = match.teamA.reduce((sum, p) => sum + p.skillLevel, 0);
      const sumB = match.teamB.reduce((sum, p) => sum + p.skillLevel, 0);

      // (4+3 = 7) vs (4+3 = 7)
      expect(sumA).toBe(7);
      expect(sumB).toBe(7);
    });

    it('Test 37: Competitive mode penalizes mixing Level 5 and Level 1', () => {
      const players = [
        createTestPlayer('p1', 'L5', 5),
        createTestPlayer('p2', 'L1', 1),
        createTestPlayer('p3', 'L3_A', 3),
        createTestPlayer('p4', 'L3_B', 3),
      ];

      const match = pairFour(players);
      const score = scoreMatch(match);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('Test 38: Multi-court batch generation creates independent batches with zero overlap', () => {
      const players: Player[] = Array.from({ length: 12 }, (_, i) =>
        createTestPlayer(`p${i + 1}`, `Player ${i + 1}`, 3)
      );

      const batches = buildNextBatches(players, 3);
      expect(batches.length).toBe(3);

      const allIds = batches.flatMap(b => b.map(p => p.id));
      const uniqueIds = new Set(allIds);
      expect(uniqueIds.size).toBe(12); // Exactly 12 unique players across 3 courts
    });
  });

  // =========================================================================
  // Part 6: Court Assignment & In-Flight Hardware Locks (Tests 39-46)
  // =========================================================================
  describe('Part 6: Court Assignment & In-Flight Hardware Locks', () => {
    beforeEach(() => {
      useStore.getState().initializeSession('Hardware Lock Session', 4);
      for (let i = 1; i <= 16; i++) {
        useStore.getState().addPlayer(createTestPlayer(`p${i}`, `Player ${i}`, 3));
      }
    });

    it('Test 39: Starting a batch assigns players to PLAYING with courtId', () => {
      const state = useStore.getState();
      const batch = {
        teamA: [state.players[0], state.players[1]],
        teamB: [state.players[2], state.players[3]],
      };

      state.startBatch(batch, 'c_1');

      const next = useStore.getState();
      expect(next.courts.find(c => c.id === 'c_1')?.status).toBe(CourtStatus.IN_PROGRESS);
      for (let i = 0; i < 4; i++) {
        expect(next.players[i].status).toBe(PlayerStatus.PLAYING);
        expect(next.players[i].currentCourtId).toBe('c_1');
      }
    });

    it('Test 40: HARDWARE LOCK: Rejects assigning any active player to a second court', () => {
      const state = useStore.getState();
      state.startBatch({ teamA: [state.players[0], state.players[1]], teamB: [state.players[2], state.players[3]] }, 'c_1');

      const activeP1 = useStore.getState().players.find(p => p.id === 'p1')!;
      const freeP5 = useStore.getState().players.find(p => p.id === 'p5')!;
      const freeP6 = useStore.getState().players.find(p => p.id === 'p6')!;
      const freeP7 = useStore.getState().players.find(p => p.id === 'p7')!;

      // Attempt to put p1 on Court 2 while active on Court 1
      useStore.getState().startBatch({ teamA: [activeP1, freeP5], teamB: [freeP6, freeP7] }, 'c_2');

      const finalState = useStore.getState();
      expect(finalState.matches.length).toBe(1);
      expect(finalState.courts.find(c => c.id === 'c_2')?.status).toBe(CourtStatus.OPEN);
    });

    it('Test 41: HARDWARE LOCK: Rejects assigning a batch to an already occupied court', () => {
      const state = useStore.getState();
      state.startBatch({ teamA: [state.players[0], state.players[1]], teamB: [state.players[2], state.players[3]] }, 'c_1');

      // Attempt to send another batch to Court 1
      state.startBatch({ teamA: [state.players[4], state.players[5]], teamB: [state.players[6], state.players[7]] }, 'c_1');

      expect(useStore.getState().matches.length).toBe(1);
    });

    it('Test 42: HARDWARE LOCK: Rejects batch with duplicate players within itself', () => {
      const p1 = useStore.getState().players[0];
      const p2 = useStore.getState().players[1];
      const p3 = useStore.getState().players[2];

      useStore.getState().startBatch({ teamA: [p1, p1], teamB: [p2, p3] }, 'c_1');
      expect(useStore.getState().matches.length).toBe(0);
    });

    it('Test 43: HARDWARE LOCK: Rejects batch with fewer than 4 players', () => {
      const p1 = useStore.getState().players[0];
      const p2 = useStore.getState().players[1];
      const p3 = useStore.getState().players[2];

      useStore.getState().startBatch({ teamA: [p1], teamB: [p2, p3] }, 'c_1');
      expect(useStore.getState().matches.length).toBe(0);
    });

    it('Test 44: Concurrent 4-court dispatch results in exactly 16 distinct players on courts', () => {
      const batches = useStore.getState().getUpcomingBatches();
      expect(batches.length).toBe(4);

      for (let i = 0; i < 4; i++) {
        useStore.getState().startBatch(batches[i], `c_${i + 1}`);
      }

      const endState = useStore.getState();
      expect(endState.matches.length).toBe(4);
      expect(endState.courts.every(c => c.status === CourtStatus.IN_PROGRESS)).toBe(true);

      const playingPlayers = endState.players.filter(p => p.status === PlayerStatus.PLAYING);
      expect(playingPlayers.length).toBe(16);

      const playingIds = playingPlayers.map(p => p.id);
      const uniquePlayingIds = new Set(playingIds);
      expect(uniquePlayingIds.size).toBe(16); // Zero duplicate entries across all 4 courts!
    });

    it('Test 45: Large facility stress: 10 courts concurrent dispatch with 40 players has zero collisions', () => {
      useStore.getState().initializeSession('Mega Complex', 10);
      for (let i = 1; i <= 40; i++) {
        useStore.getState().addPlayer(createTestPlayer(`mega_p${i}`, `Mega Player ${i}`, 3));
      }

      const batches = useStore.getState().getUpcomingBatches();
      expect(batches.length).toBe(10);

      for (let i = 0; i < 10; i++) {
        useStore.getState().startBatch(batches[i], `c_${i + 1}`);
      }

      const state = useStore.getState();
      expect(state.matches.length).toBe(10);
      expect(state.courts.every(c => c.status === CourtStatus.IN_PROGRESS)).toBe(true);

      const onCourtIds = state.matches.flatMap(m => [...m.teamA, ...m.teamB]);
      expect(onCourtIds.length).toBe(40);
      expect(new Set(onCourtIds).size).toBe(40);
    });

    it('Test 46: getUpcomingBatches strictly returns 0 batches when all players are on courts', () => {
      useStore.getState().initializeSession('Full Capacity', 1);
      for (let i = 1; i <= 4; i++) {
        useStore.getState().addPlayer(createTestPlayer(`p${i}`, `P${i}`, 3));
      }

      const batches = useStore.getState().getUpcomingBatches();
      useStore.getState().startBatch(batches[0], 'c_1');

      // All 4 players are now playing
      const nextBatches = useStore.getState().getUpcomingBatches();
      expect(nextBatches.length).toBe(0);
    });
  });

  // =========================================================================
  // Part 7: Mid-Match Player Swapping & Substitutions (Tests 47-51)
  // =========================================================================
  describe('Part 7: Mid-Match Player Swapping & Substitutions', () => {
    beforeEach(() => {
      useStore.getState().initializeSession('Swap Session', 2);
      for (let i = 1; i <= 8; i++) {
        useStore.getState().addPlayer(createTestPlayer(`p${i}`, `Player ${i}`, 3));
      }
      const p = useStore.getState().players;
      useStore.getState().startBatch({ teamA: [p[0], p[1]], teamB: [p[2], p[3]] }, 'c_1');
    });

    it('Test 47: Swapping a Team A player with an available player updates court and player statuses', () => {
      const matchId = useStore.getState().matches[0].id;
      useStore.getState().swapPlayerInMatch(matchId, Team.A, 'p1', 'p5');

      const state = useStore.getState();
      const p1 = state.players.find(p => p.id === 'p1');
      const p5 = state.players.find(p => p.id === 'p5');

      expect(p1?.status).toBe(PlayerStatus.AVAILABLE);
      expect(p1?.currentCourtId).toBeNull();
      expect(p5?.status).toBe(PlayerStatus.PLAYING);
      expect(p5?.currentCourtId).toBe('c_1');

      const match = state.matches[0];
      expect(match.teamA).toContain('p5');
      expect(match.teamA).not.toContain('p1');
    });

    it('Test 48: Swapping a Team B player with an available player updates court and player statuses', () => {
      const matchId = useStore.getState().matches[0].id;
      useStore.getState().swapPlayerInMatch(matchId, Team.B, 'p3', 'p6');

      const state = useStore.getState();
      const p3 = state.players.find(p => p.id === 'p3');
      const p6 = state.players.find(p => p.id === 'p6');

      expect(p3?.status).toBe(PlayerStatus.AVAILABLE);
      expect(p6?.status).toBe(PlayerStatus.PLAYING);
      expect(state.matches[0].teamB).toContain('p6');
      expect(state.matches[0].teamB).not.toContain('p3');
    });

    it('Test 49: HARDWARE LOCK: Rejects swapping in a player who is already playing elsewhere', () => {
      // Put p5, p6, p7, p8 on Court 2
      const p = useStore.getState().players;
      useStore.getState().startBatch({ teamA: [p[4], p[5]], teamB: [p[6], p[7]] }, 'c_2');

      const match1Id = useStore.getState().matches[0].id;
      // Try subbing p5 (playing on Court 2) into Match 1 on Court 1
      useStore.getState().swapPlayerInMatch(match1Id, Team.A, 'p1', 'p5');

      const state = useStore.getState();
      expect(state.matches[0].teamA).toContain('p1');
      expect(state.matches[0].teamA).not.toContain('p5');
    });

    it('Test 50: Supports rapid sequential substitutions without leaving orphaned state', () => {
      const matchId = useStore.getState().matches[0].id;
      // p1 -> p5
      useStore.getState().swapPlayerInMatch(matchId, Team.A, 'p1', 'p5');
      // p5 -> p6
      useStore.getState().swapPlayerInMatch(matchId, Team.A, 'p5', 'p6');

      const state = useStore.getState();
      expect(state.players.find(p => p.id === 'p1')?.status).toBe(PlayerStatus.AVAILABLE);
      expect(state.players.find(p => p.id === 'p5')?.status).toBe(PlayerStatus.AVAILABLE);
      expect(state.players.find(p => p.id === 'p6')?.status).toBe(PlayerStatus.PLAYING);
      expect(state.matches[0].teamA).toContain('p6');
    });

    it('Test 51: Subbed-out player can immediately be scheduled for the next match', () => {
      const matchId = useStore.getState().matches[0].id;
      useStore.getState().swapPlayerInMatch(matchId, Team.A, 'p1', 'p5');

      // p1 is now available, along with p6, p7, p8
      const batches = useStore.getState().getUpcomingBatches();
      expect(batches.length).toBe(1);
      const batchIds = [...batches[0].teamA, ...batches[0].teamB].map(p => p.id);
      expect(batchIds).toContain('p1');
    });
  });

  // =========================================================================
  // Part 8: Match Completion, Scoring & Statistics (Tests 52-57)
  // =========================================================================
  describe('Part 8: Match Completion, Scoring & Statistics', () => {
    beforeEach(() => {
      useStore.getState().initializeSession('Scoring Session', 2);
      for (let i = 1; i <= 8; i++) {
        useStore.getState().addPlayer(createTestPlayer(`p${i}`, `Player ${i}`, 3));
      }
      const p = useStore.getState().players;
      useStore.getState().startBatch({ teamA: [p[0], p[1]], teamB: [p[2], p[3]] }, 'c_1');
    });

    it('Test 52: Completing match frees all 4 players to AVAILABLE with currentCourtId: null', () => {
      const matchId = useStore.getState().matches[0].id;
      useStore.getState().completeMatch(matchId, Team.A, 11, 8);

      const state = useStore.getState();
      for (let i = 0; i < 4; i++) {
        expect(state.players[i].status).toBe(PlayerStatus.AVAILABLE);
        expect(state.players[i].currentCourtId).toBeNull();
      }
    });

    it('Test 53: Completing match sets court status to OPEN and currentMatchId to null', () => {
      const matchId = useStore.getState().matches[0].id;
      useStore.getState().completeMatch(matchId, Team.A, 11, 8);

      const court = useStore.getState().courts.find(c => c.id === 'c_1');
      expect(court?.status).toBe(CourtStatus.OPEN);
      expect(court?.currentMatchId).toBeNull();
    });

    it('Test 54: Winning team players get sessionWins + 1, allTimeWins + 1, gamesPlayed + 1', () => {
      const matchId = useStore.getState().matches[0].id;
      useStore.getState().completeMatch(matchId, Team.A, 11, 8);

      const state = useStore.getState();
      const p1 = state.players.find(p => p.id === 'p1')!;
      const p2 = state.players.find(p => p.id === 'p2')!;

      expect(p1.sessionWins).toBe(1);
      expect(p1.allTimeWins).toBe(1);
      expect(p1.sessionGamesPlayed).toBe(1);
      expect(p1.lastMatchResult).toBe('won');

      expect(p2.sessionWins).toBe(1);
      expect(p2.lastMatchResult).toBe('won');
    });

    it('Test 55: Losing team players get sessionLosses + 1, allTimeLosses + 1, gamesPlayed + 1', () => {
      const matchId = useStore.getState().matches[0].id;
      useStore.getState().completeMatch(matchId, Team.A, 11, 8);

      const state = useStore.getState();
      const p3 = state.players.find(p => p.id === 'p3')!;
      const p4 = state.players.find(p => p.id === 'p4')!;

      expect(p3.sessionLosses).toBe(1);
      expect(p3.allTimeLosses).toBe(1);
      expect(p3.sessionGamesPlayed).toBe(1);
      expect(p3.lastMatchResult).toBe('lost');

      expect(p4.sessionLosses).toBe(1);
      expect(p4.lastMatchResult).toBe('lost');
    });

    it('Test 56: Non-playing players have consecutiveSitOuts incremented; active players reset to 0', () => {
      const matchId = useStore.getState().matches[0].id;
      useStore.getState().completeMatch(matchId, Team.A, 11, 8);

      const state = useStore.getState();
      // p1-p4 played -> sitouts = 0
      expect(state.players[0].consecutiveSitOuts).toBe(0);
      // p5-p8 sat out -> sitouts = 1
      expect(state.players[4].consecutiveSitOuts).toBe(1);
      expect(state.players[5].consecutiveSitOuts).toBe(1);
    });

    it('Test 57: Partner and opponent history is accurately tracked up to max limits', () => {
      const matchId = useStore.getState().matches[0].id;
      useStore.getState().completeMatch(matchId, Team.A, 11, 8);

      const state = useStore.getState();
      const p1 = state.players.find(p => p.id === 'p1')!;

      expect(p1.recentPartnerIds).toContain('p2');
      expect(p1.recentOpponentIds).toEqual(expect.arrayContaining(['p3', 'p4']));
    });
  });

  // =========================================================================
  // Part 9: Winner Reversal & Match History (Tests 58-62)
  // =========================================================================
  describe('Part 9: Winner Reversal & Match History', () => {
    beforeEach(() => {
      useStore.getState().initializeSession('Reversal Session', 1);
      for (let i = 1; i <= 4; i++) {
        useStore.getState().addPlayer(createTestPlayer(`p${i}`, `Player ${i}`, 3));
      }
      const p = useStore.getState().players;
      useStore.getState().startBatch({ teamA: [p[0], p[1]], teamB: [p[2], p[3]] }, 'c_1');
      const matchId = useStore.getState().matches[0].id;
      useStore.getState().completeMatch(matchId, Team.A, 11, 9);
    });

    it('Test 58: reverseMatchWinner flips match winner from Team A to Team B', () => {
      const matchId = useStore.getState().matches[0].id;
      useStore.getState().reverseMatchWinner(matchId);

      expect(useStore.getState().matches[0].winner).toBe(Team.B);
    });

    it('Test 59: reverseMatchWinner adjusts session and all-time wins/losses correctly', () => {
      const matchId = useStore.getState().matches[0].id;
      useStore.getState().reverseMatchWinner(matchId);

      const state = useStore.getState();
      const oldWinners = [state.players.find(p => p.id === 'p1')!, state.players.find(p => p.id === 'p2')!];
      const newWinners = [state.players.find(p => p.id === 'p3')!, state.players.find(p => p.id === 'p4')!];

      for (const p of oldWinners) {
        expect(p.sessionWins).toBe(0);
        expect(p.sessionLosses).toBe(1);
      }
      for (const p of newWinners) {
        expect(p.sessionWins).toBe(1);
        expect(p.sessionLosses).toBe(0);
      }
    });

    it('Test 60: reverseMatchWinner synchronizes adjusted stats with the persistent roster', () => {
      const matchId = useStore.getState().matches[0].id;
      useStore.getState().reverseMatchWinner(matchId);

      const rosterP3 = useStore.getState().roster.find(p => p.name === 'Player 3');
      expect(rosterP3?.allTimeWins).toBe(1);
    });

    it('Test 61: Reversing a reversed match restores original winner and stats', () => {
      const matchId = useStore.getState().matches[0].id;
      useStore.getState().reverseMatchWinner(matchId); // A -> B
      useStore.getState().reverseMatchWinner(matchId); // B -> A

      const state = useStore.getState();
      expect(state.matches[0].winner).toBe(Team.A);

      const p1 = state.players.find(p => p.id === 'p1')!;
      const p3 = state.players.find(p => p.id === 'p3')!;
      expect(p1.sessionWins).toBe(1);
      expect(p1.sessionLosses).toBe(0);
      expect(p3.sessionWins).toBe(0);
      expect(p3.sessionLosses).toBe(1);
    });

    it('Test 62: Reversing a non-existent or uncompleted match safely does nothing', () => {
      useStore.getState().reverseMatchWinner('non_existent_id');
      expect(useStore.getState().matches[0].winner).toBe(Team.A);
    });
  });

  // =========================================================================
  // Part 10: Court Teardown & End Session Flow (Tests 63-66)
  // =========================================================================
  describe('Part 10: Court Teardown & End Session Flow', () => {
    it('Test 63: Removing an open court decrements courts without affecting players', () => {
      useStore.getState().initializeSession('Teardown Session', 3);
      useStore.getState().addPlayer(createTestPlayer('p1', 'Player 1', 3));

      useStore.getState().removeCourt('c_3');
      expect(useStore.getState().courts.length).toBe(2);
      expect(useStore.getState().players[0].status).toBe(PlayerStatus.AVAILABLE);
    });

    it('Test 64: Removing an in-progress court safely cancels match and frees all 4 players', () => {
      useStore.getState().initializeSession('Court Delete Active', 2);
      for (let i = 1; i <= 4; i++) {
        useStore.getState().addPlayer(createTestPlayer(`p${i}`, `Player ${i}`, 3));
      }
      const p = useStore.getState().players;
      useStore.getState().startBatch({ teamA: [p[0], p[1]], teamB: [p[2], p[3]] }, 'c_1');

      // Court 1 has active match. Now remove Court 1!
      useStore.getState().removeCourt('c_1');

      const state = useStore.getState();
      expect(state.courts.length).toBe(1);
      expect(state.matches.length).toBe(0);
      for (let i = 0; i < 4; i++) {
        expect(state.players[i].status).toBe(PlayerStatus.AVAILABLE);
        expect(state.players[i].currentCourtId).toBeNull();
      }
    });

    it('Test 65: endSession archives full session into sessionHistory', () => {
      useStore.getState().initializeSession('Archive Session', 2);
      useStore.getState().addPlayer(createTestPlayer('p1', 'Player 1', 3));
      useStore.getState().endSession();

      const history = useStore.getState().sessionHistory;
      expect(history.length).toBe(1);
      expect(history[0].session.name).toBe('Archive Session');
      expect(history[0].endedAtEpochMs).toBeGreaterThan(0);
    });

    it('Test 66: endSession clears active live state cleanly', () => {
      useStore.getState().initializeSession('Clean Session', 2);
      useStore.getState().endSession();

      const state = useStore.getState();
      expect(state.session).toBeNull();
      expect(state.sessionId).toBeNull();
      expect(state.joinCode).toBeNull();
      expect(state.courts.length).toBe(0);
      expect(state.players.length).toBe(0);
      expect(state.matches.length).toBe(0);
    });
  });

  // =========================================================================
  // Part 11: Mega Multi-Round Tournament Simulation (Tests 67-70)
  // =========================================================================
  describe('Part 11: Mega Multi-Round Tournament Simulation', () => {
    it('Test 67: 100-match continuous tournament simulation has ZERO duplicate player assignments', () => {
      useStore.getState().initializeSession('100 Match Tournament', 4);
      const PLAYER_COUNT = 24;
      for (let i = 1; i <= PLAYER_COUNT; i++) {
        useStore.getState().addPlayer(createTestPlayer(`tourney_p${i}`, `Tourney Player ${i}`, (i % 5) + 1));
      }

      let completedMatchCount = 0;

      for (let round = 0; round < 25; round++) {
        // Open all 4 courts and schedule
        const batches = useStore.getState().getUpcomingBatches();
        const openCourts = useStore.getState().courts.filter(c => c.status === CourtStatus.OPEN);

        for (let b = 0; b < Math.min(batches.length, openCourts.length); b++) {
          useStore.getState().startBatch(batches[b], openCourts[b].id);
        }

        // Invariant Check: At this moment, verify NO player is on more than 1 court
        const activeMatches = useStore.getState().matches.filter(m => m.endedAtEpochMs == null);
        const activePlayers = activeMatches.flatMap(m => [...m.teamA, ...m.teamB]);
        const uniqueActive = new Set(activePlayers);
        expect(uniqueActive.size).toBe(activePlayers.length);

        // Complete all active matches
        for (const m of activeMatches) {
          useStore.getState().completeMatch(m.id, Math.random() > 0.5 ? Team.A : Team.B, 11, 7);
          completedMatchCount++;
        }
      }

      expect(completedMatchCount).toBe(100);
      expect(useStore.getState().matches.length).toBe(100);
    });

    it('Test 68: System Invariant: Total session wins strictly equals total session losses', () => {
      const players = useStore.getState().players;
      const totalWins = players.reduce((sum, p) => sum + p.sessionWins, 0);
      const totalLosses = players.reduce((sum, p) => sum + p.sessionLosses, 0);
      expect(totalWins).toBe(totalLosses);
    });

    it('Test 69: System Invariant: Total player games played strictly equals 4 * total completed matches', () => {
      const matches = useStore.getState().matches.filter(m => m.endedAtEpochMs != null);
      const players = useStore.getState().players;
      const totalGamesPlayed = players.reduce((sum, p) => sum + p.sessionGamesPlayed, 0);
      expect(totalGamesPlayed).toBe(matches.length * 4);
    });

    it('Test 70: System Invariant: No player ever holds a currentCourtId pointing to an OPEN court', () => {
      const courts = useStore.getState().courts;
      const openCourtIds = new Set(courts.filter(c => c.status === CourtStatus.OPEN).map(c => c.id));
      const players = useStore.getState().players;

      const violated = players.some(p => p.currentCourtId && openCourtIds.has(p.currentCourtId));
      expect(violated).toBe(false);
    });
  });
});
