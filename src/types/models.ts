/**
 * TypeScript models — exact mirror of the Kotlin data classes in
 * app/src/main/java/com/qqqqqq/pickleball/data/model/
 */

export enum PlayerStatus {
  AVAILABLE = 'AVAILABLE',
  QUEUED = 'QUEUED',
  PLAYING = 'PLAYING',
  RESTING = 'RESTING',
  CHECKED_OUT = 'CHECKED_OUT',
}

export interface Player {
  id: string;
  name: string;
  skillLevel: number; // 1-5
  suggestedSkillLevel: number | null;
  photoUrl: string | null;

  // --- All-time (roster-level) stats ---
  allTimeWins: number;
  allTimeLosses: number;
  allTimeGamesPlayed: number;
  allTimeSessionsPlayed: number;

  // --- Session-scoped state ---
  sessionGamesPlayed: number;
  sessionWins: number;
  sessionLosses: number;
  consecutiveSitOuts: number;
  status: PlayerStatus;
  currentCourtId: string | null;
  queuedAtEpochMs: number;

  // --- Mid-session join priority ---
  joinedSessionAtEpochMs: number;
  isLatecomer: boolean;
  catchUpTargetGames: number;
  hasCaughtUp: boolean;

  // --- Recent partner/opponent history ---
  recentPartnerIds: string[];
  recentOpponentIds: string[];

  // --- Duo Queue ---
  lockedPartnerId: string | null;

  // --- DUPR ---
  duprProfileUrl: string | null;
}

export enum CourtStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  NEEDS_RESET = 'NEEDS_RESET',
}

export interface Court {
  id: string;
  label: string;
  status: CourtStatus;
  currentMatchId: string | null;
}

export enum Team {
  A = 'A',
  B = 'B',
}

export interface Match {
  id: string;
  courtId: string;
  teamA: string[]; // player IDs
  teamB: string[]; // player IDs
  startedAtEpochMs: number;
  endedAtEpochMs: number | null;
  winner: Team | null;
  scoreA: number | null;
  scoreB: number | null;
}

export interface Session {
  id: string;
  joinCode: string;
  name: string;
  ownerUid: string;
  createdAtEpochMs: number;
  isActive: boolean;
  courtsPerBatch: number;
  queueBatchesShown: number;
}

export interface ProposedMatch {
  teamA: Player[];
  teamB: Player[];
}

/** Helper to create a default player */
export function createPlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: '',
    name: '',
    skillLevel: 3,
    suggestedSkillLevel: null,
    photoUrl: null,
    allTimeWins: 0,
    allTimeLosses: 0,
    allTimeGamesPlayed: 0,
    allTimeSessionsPlayed: 0,
    sessionGamesPlayed: 0,
    sessionWins: 0,
    sessionLosses: 0,
    consecutiveSitOuts: 0,
    status: PlayerStatus.AVAILABLE,
    currentCourtId: null,
    queuedAtEpochMs: 0,
    joinedSessionAtEpochMs: 0,
    isLatecomer: false,
    catchUpTargetGames: 0,
    hasCaughtUp: true,
    recentPartnerIds: [],
    recentOpponentIds: [],
    lockedPartnerId: null,
    duprProfileUrl: null,
    ...overrides,
  };
}
