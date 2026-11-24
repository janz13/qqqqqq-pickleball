import { clampScore, getScoreAdvisory } from '@/components/ui/QuickScoreChips';
import { getInitials } from '@/utils/initials';
import { aggregateCloudRosterRows, useStore } from '@/lib/store';
import { createPlayer, CourtStatus, PlayerStatus, SessionType, Team } from '@/types/models';

const mockHeaderMap = new Map<string, string>([['x-forwarded-for', '198.51.100.42']]);
const mockCookieStore = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};

jest.mock('next/headers', () => ({
  headers: jest.fn(async () => ({
    get: (name: string) => mockHeaderMap.get(name.toLowerCase()) ?? null,
  })),
  cookies: jest.fn(async () => mockCookieStore),
}));

jest.mock('jose', () => {
  class MockSignJWT {
    private payload: Record<string, unknown>;
    constructor(payload: Record<string, unknown>) {
      this.payload = payload;
    }
    setProtectedHeader() { return this; }
    setIssuedAt() { return this; }
    setExpirationTime() { return this; }
    async sign() { return JSON.stringify(this.payload); }
  }
  return {
    SignJWT: MockSignJWT,
    jwtVerify: jest.fn(async (token: string) => ({ payload: JSON.parse(token) })),
  };
});

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    }),
  })),
}));

describe('Security, Hydration & Audit Regression Fixes', () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

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
    });
  });

  afterAll(() => {
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevKey;
  });

  it('clamps UI scores to [0, 99] and emits advisories for unusual pickleball scores', () => {
    expect(clampScore('-5')).toBe(0);
    expect(clampScore('150')).toBe(99);
    expect(clampScore('not-a-number')).toBe(0);
    expect(clampScore('11')).toBe(11);

    expect(getScoreAdvisory(11, 9)).toBeNull();
    expect(getScoreAdvisory(11, 10)).toMatch(/winning by 2/i);
    expect(getScoreAdvisory(5, 2)).toMatch(/below standard 11/i);
    expect(getScoreAdvisory(99, 1)).toMatch(/Unusually high score/i);
  });

  it('aggregates cloud roster stats across Open Play and completed Tournament matches while ignoring deleted snapshots', () => {
    const alice = createPlayer({ id: 'a1', name: 'Alice', skillLevel: 4, sessionGamesPlayed: 1 });
    const bob = createPlayer({ id: 'b1', name: 'Bob', skillLevel: 3, sessionGamesPlayed: 1 });
    const cara = createPlayer({ id: 'c1', name: 'Cara', skillLevel: 3, sessionGamesPlayed: 1 });
    const dan = createPlayer({ id: 'd1', name: 'Dan', skillLevel: 4, sessionGamesPlayed: 1 });

    const roster = aggregateCloudRosterRows([
      {
        id: 'sess_open',
        updated_at: '2026-11-24T01:00:00Z',
        state_json: {
          session: {
            id: 'sess_open',
            name: 'Open Play',
            joinCode: 'OPEN1',
            ownerUid: 'org1',
            createdAtEpochMs: 1000,
            isActive: false,
            courtsPerBatch: 1,
            queueBatchesShown: 1,
          },
          players: [alice, bob, cara, dan],
          matches: [
            {
              id: 'm1',
              courtId: 'c_1',
              teamA: ['a1', 'b1'],
              teamB: ['c1', 'd1'],
              startedAtEpochMs: 1000,
              endedAtEpochMs: 2000,
              winner: Team.A,
              scoreA: 11,
              scoreB: 6,
            },
          ],
        },
      },
      {
        id: 'sess_tourney',
        updated_at: '2026-11-24T02:00:00Z',
        state_json: {
          session: {
            id: 'sess_tourney',
            name: 'Grand Slam',
            joinCode: 'SLAM1',
            ownerUid: 'org1',
            createdAtEpochMs: 3000,
            isActive: false,
            courtsPerBatch: 1,
            queueBatchesShown: 1,
            sessionType: SessionType.TOURNAMENT_DOUBLES,
            tournamentState: {
              phase: 'COMPLETED',
              pairs: [
                { id: 't1', player1Id: 'a1', player2Id: 'b1', seed: 1, poolPlayWins: 1, poolPlayPointDiff: 4, poolPlayPointsScored: 11 },
                { id: 't2', player1Id: 'c1', player2Id: 'd1', seed: 2, poolPlayWins: 0, poolPlayPointDiff: -4, poolPlayPointsScored: 7 },
              ],
              matches: [
                {
                  id: 'tm1',
                  round: 1,
                  isLosersBracket: false,
                  matchNumber: 1,
                  nextMatchId: null,
                  nextLoserMatchId: null,
                  teamAId: 't1',
                  teamBId: 't2',
                  courtId: null,
                  winnerTeamId: 't2',
                  status: 'COMPLETED',
                  scoreA: 7,
                  scoreB: 11,
                  isBestOf3: false,
                  games: [],
                  startedAtEpochMs: 3000,
                  endedAtEpochMs: 4000,
                },
                {
                  id: 'tm_pending',
                  round: 2,
                  isLosersBracket: false,
                  matchNumber: 2,
                  nextMatchId: null,
                  nextLoserMatchId: null,
                  teamAId: 't1',
                  teamBId: 't2',
                  courtId: null,
                  winnerTeamId: null,
                  status: 'READY',
                  scoreA: null,
                  scoreB: null,
                  isBestOf3: false,
                  games: [],
                  startedAtEpochMs: null,
                  endedAtEpochMs: null,
                },
              ],
            },
          },
          players: [alice, bob, cara, dan],
          matches: [],
        },
      },
      {
        id: 'sess_deleted',
        updated_at: '2026-11-24T03:00:00Z',
        state_json: {
          session: {
            id: 'sess_deleted',
            name: 'Deleted',
            joinCode: 'DEL1',
            ownerUid: '__deleted__',
            deleted: true,
            createdAtEpochMs: 5000,
            isActive: false,
            courtsPerBatch: 1,
            queueBatchesShown: 1,
          },
          players: [alice],
          matches: [],
        },
      },
    ]);

    const aliceStats = roster.find(p => p.name === 'Alice')!;
    const caraStats = roster.find(p => p.name === 'Cara')!;
    expect(aliceStats.allTimeWins).toBe(1);
    expect(aliceStats.allTimeLosses).toBe(1);
    expect(aliceStats.allTimeGamesPlayed).toBe(2);
    expect(aliceStats.allTimeSessionsPlayed).toBe(2);

    expect(caraStats.allTimeWins).toBe(1);
    expect(caraStats.allTimeLosses).toBe(1);
    expect(caraStats.allTimeGamesPlayed).toBe(2);
  });

  it('archives any active prior session atomically before initializing a new session without SSR storage warnings', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const store = useStore.getState();
      store.setCurrentUser({ id: 'guest_tester', email: 'guest_tester' });
      const firstSession = store.initializeSession('First Session', 1);
      ['P1', 'P2', 'P3', 'P4'].forEach((name, idx) => {
        store.addPlayer(createPlayer({ id: `p_${idx}`, name, status: PlayerStatus.AVAILABLE }));
      });
      const openCourt = useStore.getState().courts[0];
      expect(openCourt.status).toBe(CourtStatus.OPEN);
      const batch = useStore.getState().getUpcomingBatches()[0];
      useStore.getState().startBatch(batch, openCourt.id);
      const matchId = useStore.getState().matches[0].id;
      useStore.getState().completeMatch(matchId, Team.A, 11, 5);

      const secondSession = useStore.getState().initializeSession('Second Session', 2);
      const stateAfter = useStore.getState();

      expect(stateAfter.session?.id).toBe(secondSession.id);
      expect(stateAfter.courts).toHaveLength(2);
      expect(stateAfter.sessionHistory).toHaveLength(1);
      expect(stateAfter.sessionHistory[0].session.id).toBe(firstSession.id);
      expect(stateAfter.sessionHistory[0].session.isActive).toBe(false);
      expect(stateAfter.sessionHistory[0].matches).toHaveLength(1);
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('enforces password minimum on registration and rate-limits repeated failed login attempts', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
    const { registerOrganizer, loginOrganizer } = await import('@/app/actions');

    const badUser = await registerOrganizer('ab', '12345678');
    expect(badUser.error).toMatch(/3–32 characters/);

    const shortPw = await registerOrganizer('valid_org', '1234567');
    expect(shortPw.error).toMatch(/at least 8 characters/);

    for (let i = 0; i < 5; i++) {
      const res = await loginOrganizer('rate_limit_probe', 'wrong-pass');
      expect(res.error).toBe('Invalid username or password.');
    }

    const blocked = await loginOrganizer('rate_limit_probe', 'wrong-pass');
    expect(blocked.error).toMatch(/Too many authentication attempts/);
  });

  it('derives distinguishable initials with getInitials for multi-word and numbered names', () => {
    expect(getInitials('Probe Alpha')).toBe('PA');
    expect(getInitials('GSPlayer1')).toBe('G1');
    expect(getInitials('GSPlayer2')).toBe('G2');
    expect(getInitials('Alice & Bob')).toBe('AB');
    expect(getInitials('Alex')).toBe('AL');
    expect(getInitials('   ')).toBe('?');
  });
});
