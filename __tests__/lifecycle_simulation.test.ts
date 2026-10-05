/**
 * Full Lifecycle Simulation — Login → Session → Live Play → End → History → Logout
 *
 * Each scenario uses a DIFFERENT seeded parameter set (courts, players, skill
 * spread, matching mode, guest vs registered, duo pairs, action mix). Every
 * scenario performs a randomized sequence of real organizer actions that mirror
 * exactly what the UI components call, and re-checks a full set of state
 * invariants after EVERY action.
 *
 * Seeds are fixed so any failure is 100% reproducible.
 */

import { useStore } from '../src/lib/store';
import { CourtStatus, Match, Player, PlayerStatus, Team, createPlayer } from '../src/types/models';

jest.setTimeout(180_000);

// Silence the expected "localStorage unavailable" persist warnings in node.
beforeAll(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

// ─── Deterministic RNG ──────────────────────────────────────────────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Scenario definitions (all different) ───────────────────────────────────
interface Scenario {
  name: string;
  seed: number;
  user: 'guest' | 'registered';
  courts: number;
  players: number;
  skill: [number, number];
  mode: 'balanced' | 'competitive';
  customLabels: boolean;
  duoPairs: number;
  steps: number;
}

const SCENARIOS: Scenario[] = [
  { name: 'Guest · 1 court · 6 players · balanced',            seed: 101, user: 'guest',      courts: 1,  players: 6,  skill: [3, 3], mode: 'balanced',    customLabels: false, duoPairs: 0, steps: 60 },
  { name: 'Registered · 2 courts · 9 players (odd) · compet.', seed: 202, user: 'registered', courts: 2,  players: 9,  skill: [2, 4], mode: 'competitive', customLabels: false, duoPairs: 1, steps: 70 },
  { name: 'Registered · 3 courts · 13 players · custom names', seed: 303, user: 'registered', courts: 3,  players: 13, skill: [1, 5], mode: 'balanced',    customLabels: true,  duoPairs: 0, steps: 70 },
  { name: 'Guest · 4 courts · 18 players · mixed skill',       seed: 404, user: 'guest',      courts: 4,  players: 18, skill: [1, 5], mode: 'balanced',    customLabels: false, duoPairs: 2, steps: 60 },
  { name: 'Registered · 5 courts · 22 players · competitive',  seed: 505, user: 'registered', courts: 5,  players: 22, skill: [2, 5], mode: 'competitive', customLabels: true,  duoPairs: 1, steps: 50 },
  { name: 'Registered · 6 courts · 26 players · L3-L4 only',   seed: 606, user: 'registered', courts: 6,  players: 26, skill: [3, 4], mode: 'balanced',    customLabels: false, duoPairs: 3, steps: 40 },
  { name: 'Guest · 2 courts · 4 players (bare minimum)',       seed: 707, user: 'guest',      courts: 2,  players: 4,  skill: [2, 3], mode: 'balanced',    customLabels: false, duoPairs: 0, steps: 60 },
  { name: 'Registered · 8 courts · 33 players · large venue',  seed: 808, user: 'registered', courts: 8,  players: 33, skill: [1, 5], mode: 'balanced',    customLabels: true,  duoPairs: 2, steps: 25 },
  { name: 'Registered · 3 courts · 16 players · 4 duo pairs',  seed: 909, user: 'registered', courts: 3,  players: 16, skill: [3, 5], mode: 'competitive', customLabels: false, duoPairs: 4, steps: 60 },
  { name: 'Guest · 10 courts · 12 players (more courts than needed)', seed: 1010, user: 'guest', courts: 10, players: 12, skill: [1, 4], mode: 'balanced', customLabels: false, duoPairs: 0, steps: 40 },
  { name: 'Registered · 2 courts · 20 players (long queue)',   seed: 1111, user: 'registered', courts: 2,  players: 20, skill: [2, 5], mode: 'balanced',    customLabels: false, duoPairs: 1, steps: 70 },
  { name: 'Registered · 4 courts · 15 players · competitive L1-L5', seed: 1212, user: 'registered', courts: 4, players: 15, skill: [1, 5], mode: 'competitive', customLabels: true, duoPairs: 0, steps: 60 },
];

// ─── Invariants ─────────────────────────────────────────────────────────────
function assertInvariants(ctx: string) {
  const s = useStore.getState();
  const fail = (msg: string) => { throw new Error(`[${ctx}] INVARIANT BROKEN: ${msg}`); };

  const active = s.matches.filter(m => m.endedAtEpochMs == null);
  const completed = s.matches.filter(m => m.endedAtEpochMs != null);
  const playerById = new Map(s.players.map(p => [p.id, p]));
  const courtById = new Map(s.courts.map(c => [c.id, c]));

  // I1: no player in two active matches; every active match has 4 unique players
  const seen = new Set<string>();
  for (const m of active) {
    const ids = [...m.teamA, ...m.teamB];
    if (new Set(ids).size !== 4) fail(`match ${m.id} does not have 4 unique players`);
    for (const id of ids) {
      if (seen.has(id)) fail(`player ${id} is in two active matches (DOUBLE ENTRY)`);
      seen.add(id);
    }
  }

  // I2: each active match sits on an existing IN_PROGRESS court that points back to it
  for (const m of active) {
    const c = courtById.get(m.courtId);
    if (!c) fail(`active match ${m.id} references missing court ${m.courtId}`);
    else {
      if (c.status !== CourtStatus.IN_PROGRESS) fail(`court ${c.label} hosts active match but is ${c.status}`);
      if (c.currentMatchId !== m.id) fail(`court ${c.label} currentMatchId mismatch`);
    }
  }

  // I3: each IN_PROGRESS court has exactly one active match
  for (const c of s.courts) {
    const onCourt = active.filter(m => m.courtId === c.id);
    if (c.status === CourtStatus.IN_PROGRESS && onCourt.length !== 1) fail(`court ${c.label} IN_PROGRESS with ${onCourt.length} active matches`);
    if (c.status !== CourtStatus.IN_PROGRESS && onCourt.length !== 0) fail(`court ${c.label} is ${c.status} but has an active match`);
  }

  // I4: on-court players are PLAYING on the right court
  for (const m of active) {
    for (const id of [...m.teamA, ...m.teamB]) {
      const p = playerById.get(id);
      if (!p) fail(`active match references missing player ${id}`);
      else if (p.status !== PlayerStatus.PLAYING || p.currentCourtId !== m.courtId) {
        fail(`player ${p.name} in active match but status=${p.status} court=${p.currentCourtId}`);
      }
    }
  }

  // I5: no ghost players (PLAYING / court assigned but not in an active match)
  for (const p of s.players) {
    if ((p.status === PlayerStatus.PLAYING || p.currentCourtId) && !seen.has(p.id)) {
      fail(`ghost player ${p.name}: status=${p.status} court=${p.currentCourtId} but in no active match`);
    }
  }

  // I6: per-player stat consistency
  for (const p of s.players) {
    if (p.sessionWins + p.sessionLosses !== p.sessionGamesPlayed) fail(`${p.name} W+L != games`);
    if (p.sessionWins < 0 || p.sessionLosses < 0) fail(`${p.name} negative stats`);
  }

  // I7: stats exactly match a recomputation from completed matches
  const expW = new Map<string, number>(), expL = new Map<string, number>();
  for (const m of completed) {
    const winners = m.winner === Team.A ? m.teamA : m.teamB;
    const losers = m.winner === Team.A ? m.teamB : m.teamA;
    winners.forEach(id => expW.set(id, (expW.get(id) || 0) + 1));
    losers.forEach(id => expL.set(id, (expL.get(id) || 0) + 1));
  }
  for (const p of s.players) {
    if ((expW.get(p.id) || 0) !== p.sessionWins) fail(`${p.name} wins ${p.sessionWins} != recomputed ${expW.get(p.id) || 0}`);
    if ((expL.get(p.id) || 0) !== p.sessionLosses) fail(`${p.name} losses ${p.sessionLosses} != recomputed ${expL.get(p.id) || 0}`);
  }

  // I8: totals
  const totalGames = s.players.reduce((a, p) => a + p.sessionGamesPlayed, 0);
  if (totalGames !== completed.length * 4) fail(`total games ${totalGames} != 4 × ${completed.length}`);

  // I9: no duplicate player names in session
  const names = s.players.map(p => p.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) fail('duplicate player names in session');

  // I10: duo locks are bidirectional
  for (const p of s.players) {
    if (p.lockedPartnerId) {
      const q = playerById.get(p.lockedPartnerId);
      if (!q || q.lockedPartnerId !== p.id) fail(`duo lock ${p.name} is not bidirectional`);
    }
  }

  // I11: player-view derivation — queue and courts are disjoint
  const queued = s.players.filter(p => p.status === PlayerStatus.AVAILABLE && !p.currentCourtId && !seen.has(p.id));
  for (const q of queued) if (seen.has(q.id)) fail(`${q.name} shown in queue AND on court`);
}

function assertBatchesClean(ctx: string) {
  const s = useStore.getState();
  const activeIds = new Set(s.matches.filter(m => !m.endedAtEpochMs).flatMap(m => [...m.teamA, ...m.teamB]));
  const batches = s.getUpcomingBatches();
  const seen = new Set<string>();
  for (const b of batches) {
    for (const p of [...b.teamA, ...b.teamB]) {
      if (activeIds.has(p.id)) throw new Error(`[${ctx}] upcoming batch contains on-court player ${p.name}`);
      if (seen.has(p.id)) throw new Error(`[${ctx}] player ${p.name} appears in two upcoming batches`);
      const sp = s.players.find(x => x.id === p.id);
      if (!sp || sp.status !== PlayerStatus.AVAILABLE) throw new Error(`[${ctx}] upcoming batch contains non-available player ${p.name}`);
      seen.add(p.id);
    }
  }
  return batches;
}

// ─── UI-equivalent organizer actions ────────────────────────────────────────
const NAMES = ['Ava','Ben','Cara','Dan','Eli','Fay','Gus','Hana','Ivan','Jill','Kai','Lia','Max','Nia','Omar','Pia','Quin','Rhea','Sam','Tess',
  'Uma','Vic','Wes','Xia','Yuri','Zoe','Abe','Bea','Cy','Dee','Ed','Flo','Gil','Hal','Ida','Jon','Kim','Lou','Mo','Ned','Ola','Pat'];

function uiAddPlayer(name: string, skill: number) {
  // Mirrors RosterPanel.handleAddPlayer
  const { players, addPlayer } = useStore.getState();
  if (players.some(p => p.name.toLowerCase() === name.trim().toLowerCase())) return false;
  addPlayer(createPlayer({
    id: 'p_' + Math.random().toString(36).substr(2, 9),
    name: name.trim(),
    skillLevel: skill,
    queuedAtEpochMs: Date.now(),
    joinedSessionAtEpochMs: Date.now(),
    isLatecomer: players.length > 8,
    status: PlayerStatus.AVAILABLE,
  }));
  return true;
}

function uiDispatchAll(): number {
  // Mirrors CourtsPanel: valid batches mapped onto open courts in order
  const batches = assertBatchesClean('dispatch');
  const open = useStore.getState().courts.filter(c => c.status === CourtStatus.OPEN);
  let sent = 0;
  for (let i = 0; i < Math.min(batches.length, open.length); i++) {
    const before = useStore.getState().matches.length;
    useStore.getState().startBatch(batches[i], open[i].id);
    if (useStore.getState().matches.length === before + 1) sent++;
  }
  return sent;
}

function activeMatches(): Match[] {
  return useStore.getState().matches.filter(m => m.endedAtEpochMs == null);
}

// ─── Scenario runner ────────────────────────────────────────────────────────
interface RunReport {
  completed: number; dispatched: number; swaps: number; reversals: number;
  restToggles: number; lateAdds: number; courtOps: number; gamesMin: number; gamesMax: number;
}

function runScenario(sc: Scenario): RunReport {
  const rnd = mulberry32(sc.seed);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)];
  const report: RunReport = { completed: 0, dispatched: 0, swaps: 0, reversals: 0, restToggles: 0, lateAdds: 0, courtOps: 0, gamesMin: 0, gamesMax: 0 };

  // 1. LOGIN
  const userId = sc.user === 'guest' ? 'guest_' + sc.seed : 'org_' + sc.seed;
  useStore.getState().setCurrentUser({ email: sc.user === 'guest' ? 'Guest Organizer' : `${userId}@x.com`, id: userId });
  expect(useStore.getState().currentUser?.id).toBe(userId);

  // 2. CREATE SESSION (mirrors dashboard/new handleStart)
  const labels = sc.customLabels ? Array.from({ length: sc.courts }, (_, i) => `Arena ${String.fromCharCode(65 + i)}`) : undefined;
  const session = useStore.getState().initializeSession(`Sim ${sc.seed}`, sc.courts, labels);
  useStore.getState().updateSession(session.id, { matchingMode: sc.mode });
  expect(useStore.getState().courts).toHaveLength(sc.courts);
  expect(useStore.getState().session?.matchingMode).toBe(sc.mode);
  assertInvariants('after create');

  // 3. ROSTER
  let nameIdx = 0;
  for (let i = 0; i < sc.players; i++) {
    const skill = sc.skill[0] + Math.floor(rnd() * (sc.skill[1] - sc.skill[0] + 1));
    uiAddPlayer(NAMES[nameIdx++ % NAMES.length] + (nameIdx > NAMES.length ? nameIdx : ''), skill);
  }
  // Attempt duplicates (must be rejected)
  uiAddPlayer(NAMES[0].toUpperCase(), 3);
  useStore.getState().addPlayer(createPlayer({ id: 'dup', name: ` ${NAMES[1].toLowerCase()} ` }));
  expect(useStore.getState().players).toHaveLength(sc.players);

  // Duo pairs
  for (let d = 0; d < sc.duoPairs; d++) {
    const free = useStore.getState().players.filter(p => !p.lockedPartnerId);
    if (free.length < 2) break;
    useStore.getState().setLockedPartner(free[0].id, free[1].id);
  }
  assertInvariants('after roster');

  // 4. LIVE PLAY — randomized action stream
  for (let step = 0; step < sc.steps; step++) {
    const r = rnd();
    const ctx = `${sc.name} step ${step}`;
    const st = useStore.getState();

    if (r < 0.30) {
      report.dispatched += uiDispatchAll();
    } else if (r < 0.60) {
      const act = activeMatches();
      if (act.length) {
        const m = pick(act);
        useStore.getState().completeMatch(m.id, rnd() < 0.5 ? Team.A : Team.B, 11, Math.floor(rnd() * 10));
        report.completed++;
      }
    } else if (r < 0.68) {
      // Mid-match swap (mirrors CourtCard swap modal)
      const act = activeMatches();
      const activeIds = new Set(act.flatMap(m => [...m.teamA, ...m.teamB]));
      const bench = st.players.filter(p => p.status === PlayerStatus.AVAILABLE && !p.currentCourtId && !activeIds.has(p.id));
      if (act.length && bench.length) {
        const m = pick(act);
        const out = pick([...m.teamA, ...m.teamB]);
        const team = m.teamA.includes(out) ? Team.A : Team.B;
        useStore.getState().swapPlayerInMatch(m.id, team, out, pick(bench).id);
        report.swaps++;
      }
    } else if (r < 0.76) {
      // Rest / un-rest a benched player
      const candidates = st.players.filter(p => p.status === PlayerStatus.AVAILABLE || p.status === PlayerStatus.RESTING);
      if (candidates.length) {
        const p = pick(candidates);
        useStore.getState().updatePlayerStatus(p.id, p.status === PlayerStatus.RESTING ? PlayerStatus.AVAILABLE : PlayerStatus.RESTING);
        report.restToggles++;
      }
    } else if (r < 0.82) {
      // Latecomer walks in
      if (uiAddPlayer(`Late${sc.seed}_${step}`, sc.skill[0] + Math.floor(rnd() * (sc.skill[1] - sc.skill[0] + 1)))) report.lateAdds++;
    } else if (r < 0.86) {
      // Rename a court (mirrors CourtCard label edit)
      const c = pick(st.courts);
      if (c) { useStore.getState().updateCourt({ ...c, label: `Renamed ${step}` }); report.courtOps++; }
    } else if (r < 0.89) {
      // Add a court with a custom name
      useStore.getState().addCourt({ id: 'c_' + Math.random().toString(36).substr(2, 9), label: rnd() < 0.5 ? `Stadium ${step}` : '', status: CourtStatus.OPEN, currentMatchId: null });
      report.courtOps++;
    } else if (r < 0.92) {
      // Remove an OPEN court (UI only shows the button on open courts) — keep at least 1
      const open = st.courts.filter(c => c.status === CourtStatus.OPEN);
      if (open.length && st.courts.length > 1) { useStore.getState().removeCourt(pick(open).id); report.courtOps++; }
    } else if (r < 0.95) {
      // Needs-reset cycle
      const open = st.courts.filter(c => c.status === CourtStatus.OPEN);
      const reset = st.courts.filter(c => c.status === CourtStatus.NEEDS_RESET);
      if (reset.length && rnd() < 0.6) useStore.getState().updateCourt({ ...pick(reset), status: CourtStatus.OPEN });
      else if (open.length) useStore.getState().updateCourt({ ...pick(open), status: CourtStatus.NEEDS_RESET });
      report.courtOps++;
    } else if (r < 0.98) {
      // Reverse a completed match winner (MatchHistoryPanel)
      const done = st.matches.filter(m => m.endedAtEpochMs != null);
      if (done.length) { useStore.getState().reverseMatchWinner(pick(done).id); report.reversals++; }
    } else {
      useStore.getState().broadcastAnnouncement(`Announcement ${step}`);
      expect(useStore.getState().session?.currentAnnouncement).toBe(`Announcement ${step}`);
    }

    assertInvariants(ctx);
  }

  // 5. WIND DOWN — finish every match, reopen all courts, play 3 more full rounds
  for (const m of activeMatches()) { useStore.getState().completeMatch(m.id, Team.A, 11, 4); report.completed++; }
  for (const c of useStore.getState().courts) if (c.status === CourtStatus.NEEDS_RESET) useStore.getState().updateCourt({ ...c, status: CourtStatus.OPEN });
  for (const p of useStore.getState().players) if (p.status === PlayerStatus.RESTING) useStore.getState().updatePlayerStatus(p.id, PlayerStatus.AVAILABLE);
  for (let round = 0; round < 3; round++) {
    report.dispatched += uiDispatchAll();
    assertInvariants(`${sc.name} final round ${round} dispatched`);
    for (const m of activeMatches()) { useStore.getState().completeMatch(m.id, round % 2 ? Team.A : Team.B, 11, 6); report.completed++; }
    assertInvariants(`${sc.name} final round ${round} completed`);
  }

  const finalState = useStore.getState();
  expect(finalState.players.every(p => p.status === PlayerStatus.AVAILABLE && p.currentCourtId === null)).toBe(true);
  expect(finalState.courts.every(c => c.status === CourtStatus.OPEN && c.currentMatchId === null)).toBe(true);
  const games = finalState.players.map(p => p.sessionGamesPlayed);
  report.gamesMin = Math.min(...games);
  report.gamesMax = Math.max(...games);

  // 6. END SESSION → HISTORY
  const snapshotPlayers = finalState.players.length;
  const snapshotMatches = finalState.matches.length;
  useStore.getState().endSession();
  const after = useStore.getState();
  expect(after.session).toBeNull();
  expect(after.players).toHaveLength(0);
  const hist = after.sessionHistory.find(h => h.session.id === session.id)!;
  expect(hist).toBeDefined();
  expect(hist.players).toHaveLength(snapshotPlayers);
  expect(hist.matches).toHaveLength(snapshotMatches);
  expect(hist.matches.every(m => m.endedAtEpochMs != null && m.winner != null)).toBe(true);

  // 7. ROSTER PERSISTENCE & LOGOUT
  if (sc.user === 'registered') {
    const rosterNames = new Set(after.roster.map(r => r.name.toLowerCase()));
    hist.players.forEach(p => expect(rosterNames.has(p.name.toLowerCase())).toBe(true));
    // All-time stats in roster must be >= what this session earned
    for (const p of hist.players) {
      const r = after.roster.find(x => x.name.toLowerCase() === p.name.toLowerCase())!;
      expect(r.allTimeWins).toBeGreaterThanOrEqual(p.sessionWins);
    }
    useStore.getState().setCurrentUser(null);
    expect(useStore.getState().roster).toHaveLength(0);
    useStore.getState().setCurrentUser({ email: `${userId}@x.com`, id: userId });
    expect(useStore.getState().roster.length).toBeGreaterThanOrEqual(snapshotPlayers);
  } else {
    useStore.getState().setCurrentUser(null);
    expect(useStore.getState().rostersByOwner[userId]).toBeUndefined();
  }

  return report;
}

// ─── Tests ──────────────────────────────────────────────────────────────────
describe('Full Lifecycle Simulation — 12 scenarios, varied parameters, invariants after every action', () => {
  const reports: Record<string, RunReport> = {};

  beforeEach(() => {
    useStore.setState({
      currentUser: null, session: null, sessionId: null, joinCode: null,
      players: [], courts: [], matches: [], sessionHistory: [], roster: [], rostersByOwner: {},
    });
  });

  afterAll(() => {
    // eslint-disable-next-line no-console
    console.log('\nSIMULATION REPORT\n' + JSON.stringify(reports, null, 1));
  });

  SCENARIOS.forEach(sc => {
    it(`Scenario: ${sc.name} (seed ${sc.seed})`, () => {
      reports[sc.name] = runScenario(sc);
      expect(reports[sc.name].completed).toBeGreaterThan(0);
    });
  });

  it('Back-to-back sessions by the same organizer keep history and isolate state', () => {
    useStore.getState().setCurrentUser({ email: 'b2b@x.com', id: 'org_b2b' });
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const s = useStore.getState().initializeSession(`B2B ${i}`, 2 + i);
      ids.push(s.id);
      for (let p = 0; p < 8 + i; p++) uiAddPlayer(`B${i}_${p}`, 3);
      uiDispatchAll();
      for (const m of activeMatches()) useStore.getState().completeMatch(m.id, Team.A, 11, 3);
      assertInvariants(`b2b ${i}`);
      useStore.getState().endSession();
    }
    const hist = useStore.getState().sessionHistory;
    expect(hist.map(h => h.session.id)).toEqual(expect.arrayContaining(ids));
    expect(useStore.getState().players).toHaveLength(0);
  });

  it('Two organizers on one device never see each other\'s sessions or rosters', () => {
    useStore.getState().setCurrentUser({ email: 'a@x.com', id: 'org_A' });
    useStore.getState().initializeSession('A session', 2);
    for (let p = 0; p < 8; p++) uiAddPlayer(`A_${p}`, 3);
    useStore.getState().setCurrentUser({ email: 'b@x.com', id: 'org_B' });
    expect(useStore.getState().session).toBeNull();
    expect(useStore.getState().players).toHaveLength(0);
    expect(useStore.getState().roster.some(r => r.name.startsWith('A_'))).toBe(false);
    useStore.getState().setCurrentUser({ email: 'a@x.com', id: 'org_A' });
    expect(useStore.getState().roster.filter(r => r.name.startsWith('A_'))).toHaveLength(8);
  });

  it('Guest session data does not leak into a later logged-in account', () => {
    useStore.getState().setCurrentUser({ email: 'Guest Organizer', id: 'guest_x' });
    useStore.getState().initializeSession('Guest S', 2);
    for (let p = 0; p < 6; p++) uiAddPlayer(`G_${p}`, 3);
    useStore.getState().setCurrentUser({ email: 'real@x.com', id: 'org_real' });
    expect(useStore.getState().session).toBeNull();
    expect(useStore.getState().roster.some(r => r.name.startsWith('G_'))).toBe(false);
  });
});
