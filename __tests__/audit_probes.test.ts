/**
 * Audit Probes — targeted reproductions of defects found by code review.
 *
 * Each probe uses `it.failing`: it asserts the CORRECT behaviour, so it is
 * reported as passing only while the defect still exists. When a defect is
 * fixed, its probe will start "failing" — at that point convert it to a
 * normal `it(...)` so it becomes a permanent regression test.
 */

import { useStore } from '../src/lib/store';
import { buildNextBatches } from '../src/engine/queue-engine';
import { CourtStatus, PlayerStatus, Team, createPlayer } from '../src/types/models';

beforeAll(() => { jest.spyOn(console, 'warn').mockImplementation(() => {}); });

function setup(courts: number, n: number, skill = 3) {
  useStore.setState({
    currentUser: { email: 'probe@x.com', id: 'org_probe' }, session: null, players: [], courts: [], matches: [],
    sessionHistory: [], roster: [], rostersByOwner: {},
  });
  useStore.getState().initializeSession('Probe', courts);
  for (let i = 0; i < n; i++) {
    useStore.getState().addPlayer(createPlayer({ id: `p${i}`, name: `P${i}`, skillLevel: skill, queuedAtEpochMs: i, joinedSessionAtEpochMs: i }));
  }
}
function dispatchFirst(courtId = 'c_1') {
  const b = useStore.getState().getUpcomingBatches();
  useStore.getState().startBatch(b[0], courtId);
  return useStore.getState().matches.find(m => m.courtId === courtId && !m.endedAtEpochMs)!;
}

describe('Audit probes (it.failing = defect currently reproduces)', () => {
  // ── D1 ────────────────────────────────────────────────────────────────────
  it.failing('D1: completing the same match twice must not double-count wins/games (double-tap on "Team 1 Wins")', () => {
    setup(1, 4);
    const m = dispatchFirst();
    useStore.getState().completeMatch(m.id, Team.A, 11, 0);
    useStore.getState().completeMatch(m.id, Team.A, 11, 0); // second tap
    const p = useStore.getState().players.find(x => x.id === m.teamA[0])!;
    expect(p.sessionGamesPlayed).toBe(1);
    expect(p.sessionWins).toBe(1);
  });

  it.failing('D1b: completing a stale match must not free players who are now on a NEW match', () => {
    setup(1, 4);
    const m1 = dispatchFirst();
    useStore.getState().completeMatch(m1.id, Team.A, 11, 0);
    const m2 = dispatchFirst(); // same 4 players, new match
    useStore.getState().completeMatch(m1.id, Team.B, 11, 0); // stale re-submit of match 1
    const s = useStore.getState();
    const p = s.players.find(x => x.id === m2.teamA[0])!;
    expect(p.status).toBe(PlayerStatus.PLAYING);
    expect(s.courts[0].status).toBe(CourtStatus.IN_PROGRESS);
  });

  // ── D2 ────────────────────────────────────────────────────────────────────
  it.failing('D2: Roster dropdown → "Playing" on a benched player must not create a ghost who vanishes from the queue', () => {
    setup(1, 5);
    useStore.getState().updatePlayerStatus('p0', PlayerStatus.PLAYING); // RosterPanel <select> allows this
    const s = useStore.getState();
    const p0 = s.players.find(p => p.id === 'p0')!;
    const inAnyMatch = s.matches.some(m => !m.endedAtEpochMs && [...m.teamA, ...m.teamB].includes('p0'));
    // Correct behaviour: either rejected, or the player is actually on a court.
    expect(p0.status === PlayerStatus.PLAYING && !inAnyMatch).toBe(false);
  });

  it.failing('D2b: player marked "Out" while on court must stay checked-out after the match ends', () => {
    setup(1, 4);
    const m = dispatchFirst();
    const leaver = m.teamA[0];
    useStore.getState().updatePlayerStatus(leaver, PlayerStatus.CHECKED_OUT); // left early
    useStore.getState().completeMatch(m.id, Team.B, 11, 5);
    expect(useStore.getState().players.find(p => p.id === leaver)!.status).toBe(PlayerStatus.CHECKED_OUT);
  });

  // ── D3 ────────────────────────────────────────────────────────────────────
  it.failing('D3: Edit-player dialog must not allow renaming to an existing player\'s name', () => {
    setup(1, 4);
    const p1 = useStore.getState().players.find(p => p.id === 'p1')!;
    useStore.getState().updatePlayer({ ...p1, name: 'p0' }); // RosterPanel edit → Save
    const names = useStore.getState().players.map(p => p.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  // ── D4 ────────────────────────────────────────────────────────────────────
  it.failing('D4: CSV half-levels (template uses 3.5 / 4.0) must not be treated as a forbidden 3+ tier gap in competitive mode', () => {
    // 3.5 vs 3.0 is only half a level apart. In competitive mode skillDiff=0.5 hits the
    // `else` branch (skillDiff * 100000) which is meant for 3+ tier gaps.
    const pool = [
      createPlayer({ id: 'a', name: 'A', skillLevel: 3.5, queuedAtEpochMs: 1 }),
      createPlayer({ id: 'b', name: 'B', skillLevel: 3, queuedAtEpochMs: 2 }),
      createPlayer({ id: 'c', name: 'C', skillLevel: 3, queuedAtEpochMs: 3 }),
      createPlayer({ id: 'd', name: 'D', skillLevel: 3, queuedAtEpochMs: 4 }),
      createPlayer({ id: 'e', name: 'E', skillLevel: 5, queuedAtEpochMs: 5 }),
      createPlayer({ id: 'f', name: 'F', skillLevel: 5, queuedAtEpochMs: 6 }),
      createPlayer({ id: 'g', name: 'G', skillLevel: 5, queuedAtEpochMs: 7 }),
    ];
    const [batch] = buildNextBatches(pool, 1, 'competitive');
    const ids = batch.map(p => p.id).sort();
    // Correct: the 3.5 player (first in queue) plays with the three L3s.
    expect(ids).toEqual(['a', 'b', 'c', 'd']);
  });

  // ── D5 ────────────────────────────────────────────────────────────────────
  it.failing('D5: a player added mid-session (latecomer) must actually receive catch-up priority', () => {
    setup(1, 8);
    // Play 4 rounds so the field has games
    for (let i = 0; i < 4; i++) {
      const m = dispatchFirst();
      useStore.getState().completeMatch(m.id, Team.A, 11, 3);
    }
    // Exactly what RosterPanel.handleAddPlayer does for player #9+
    useStore.getState().addPlayer(createPlayer({
      id: 'late', name: 'Latecomer', skillLevel: 3, queuedAtEpochMs: Date.now() + 10_000,
      joinedSessionAtEpochMs: Date.now(), isLatecomer: true, status: PlayerStatus.AVAILABLE,
    }));
    const late = useStore.getState().players.find(p => p.id === 'late')!;
    // createPlayer defaults hasCaughtUp=true and nothing recomputes it, so
    // priorityOrder() never treats this player as a latecomer.
    expect(late.hasCaughtUp).toBe(false);
  });

  // ── D6 ────────────────────────────────────────────────────────────────────
  it.failing('D6: starting a NEW session must close (not orphan) the previous active session', () => {
    setup(2, 8);
    const first = useStore.getState().session!;
    dispatchFirst();
    useStore.getState().initializeSession('Second', 2); // "Create New Session" while one is live
    const hist = useStore.getState().sessionHistory;
    // Correct: first session archived to history (and marked inactive in cloud).
    expect(hist.some(h => h.session.id === first.id)).toBe(true);
  });

  // ── D7 ────────────────────────────────────────────────────────────────────
  it.failing('D7: generated join codes must always be exactly 5 characters', () => {
    // initializeSession uses Math.random().toString(36).substring(2, 7)
    const spy = jest.spyOn(Math, 'random').mockReturnValue(0.5); // "0.i" → "I"
    try {
      setup(1, 0);
      expect(useStore.getState().session!.joinCode).toHaveLength(5);
    } finally { spy.mockRestore(); }
  });
});

describe('Audit checks that PASS (verified-correct behaviour)', () => {
  it('Reversing a winner twice restores the original stats exactly', () => {
    setup(1, 4);
    const m = dispatchFirst();
    useStore.getState().completeMatch(m.id, Team.A, 11, 7);
    const before = JSON.stringify(useStore.getState().players.map(p => [p.sessionWins, p.sessionLosses]));
    useStore.getState().reverseMatchWinner(m.id);
    useStore.getState().reverseMatchWinner(m.id);
    expect(JSON.stringify(useStore.getState().players.map(p => [p.sessionWins, p.sessionLosses]))).toBe(before);
  });

  it('Swapped-out player is immediately eligible for the next batch; swapped-in is not', () => {
    setup(2, 9);
    const m = dispatchFirst();
    const out = m.teamA[0];
    const sub = useStore.getState().players.find(p => p.status === PlayerStatus.AVAILABLE)!.id;
    useStore.getState().swapPlayerInMatch(m.id, out, sub);
    const ids = useStore.getState().getUpcomingBatches().flatMap(b => [...b.teamA, ...b.teamB].map(p => p.id));
    expect(ids).toContain(out);
    expect(ids).not.toContain(sub);
  });

  it('Removing a court mid-match deletes the match and frees all 4 players (no ghosts)', () => {
    setup(2, 8);
    const m = dispatchFirst();
    useStore.getState().removeCourt(m.courtId);
    const s = useStore.getState();
    expect(s.matches.find(x => x.id === m.id)).toBeUndefined();
    [...m.teamA, ...m.teamB].forEach(id => {
      const p = s.players.find(x => x.id === id)!;
      expect(p.status).toBe(PlayerStatus.AVAILABLE);
      expect(p.currentCourtId).toBeNull();
    });
  });

  // D8 — found by this run: buildNextBatches drops every combo containing a locked
  // player whose partner is not in the available pool, so the player starves.
  it.failing('D8: Duo lock with one partner resting: the other partner still gets games', () => {
    setup(1, 8);
    useStore.getState().setLockedPartner('p0', 'p1');
    useStore.getState().updatePlayerStatus('p1', PlayerStatus.RESTING);
    let p0Played = false;
    for (let i = 0; i < 6; i++) {
      const b = useStore.getState().getUpcomingBatches();
      if (!b.length) break;
      useStore.getState().startBatch(b[0], 'c_1');
      const m = useStore.getState().matches.find(x => !x.endedAtEpochMs)!;
      if ([...m.teamA, ...m.teamB].includes('p0')) p0Played = true;
      useStore.getState().completeMatch(m.id, Team.A, 11, 2);
    }
    expect(p0Played).toBe(true);
  });

  it('Odd player counts: nobody sits out more than 2 rounds in a row (9 players, 2 courts, 30 rounds)', () => {
    setup(2, 9);
    const streak = new Map<string, number>();
    let maxStreak = 0;
    for (let r = 0; r < 30; r++) {
      const b = useStore.getState().getUpcomingBatches();
      const open = useStore.getState().courts.filter(c => c.status === CourtStatus.OPEN);
      b.slice(0, open.length).forEach((x, i) => useStore.getState().startBatch(x, open[i].id));
      const playing = new Set(useStore.getState().matches.filter(m => !m.endedAtEpochMs).flatMap(m => [...m.teamA, ...m.teamB]));
      for (const p of useStore.getState().players) {
        const v = playing.has(p.id) ? 0 : (streak.get(p.id) || 0) + 1;
        streak.set(p.id, v);
        maxStreak = Math.max(maxStreak, v);
      }
      useStore.getState().matches.filter(m => !m.endedAtEpochMs).forEach(m => useStore.getState().completeMatch(m.id, Team.A, 11, 4));
    }
    expect(maxStreak).toBeLessThanOrEqual(2);
  });
});
