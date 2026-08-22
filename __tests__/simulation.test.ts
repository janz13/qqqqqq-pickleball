import { Player, PlayerStatus, Court, CourtStatus, Match, Team, createPlayer } from '../src/types/models';
import { buildNextBatches } from '../src/engine/queue-engine';
import { pairFour } from '../src/engine/pairing-engine';
import * as fs from 'fs';

describe('Stress Test Simulation', () => {
  it('Simulates 48 players and outputs results', () => {
    // Helper to generate a random number
    const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

    let players: Player[] = [];
    const createP = (id: string, skill: number) => {
      players.push(createPlayer({
        id,
        name: `Player ${id} (L${skill})`,
        skillLevel: skill,
        status: PlayerStatus.AVAILABLE,
        queuedAtEpochMs: Date.now() - rand(0, 10000),
        joinedSessionAtEpochMs: Date.now()
      }));
    };

    // 2 Level 5, 4 Level 4, 18 Level 3, 12 Level 2
    for (let i = 1; i <= 2; i++) createP(`L5_${i}`, 5);
    for (let i = 1; i <= 4; i++) createP(`L4_${i}`, 4);
    for (let i = 1; i <= 18; i++) createP(`L3_${i}`, 3);
    for (let i = 1; i <= 12; i++) createP(`L2_${i}`, 2);

    const lockPair = (p1Id: string, p2Id: string) => {
      const p1 = players.find(p => p.id === p1Id);
      const p2 = players.find(p => p.id === p2Id);
      if (p1 && p2) {
        p1.lockedPartnerId = p2.id;
        p2.lockedPartnerId = p1.id;
      }
    };
    
    // Locked pair of Level 5 and Level 2
    lockPair('L5_1', 'L2_1');
    // Locked pair of two Level 3s
    lockPair('L3_1', 'L3_2');

    const courts: Court[] = Array.from({ length: 4 }, (_, i) => ({
      id: `c${i + 1}`,
      label: `Court ${i + 1}`,
      status: CourtStatus.OPEN,
      currentMatchId: null
    }));

    let matches: Match[] = [];
    let round = 1;
    const NUM_ROUNDS = 24; // 24 rounds * 16 players = 384 slots / 36 players = 10.6 games each

    let metrics = {
      ruleViolations: 0,
      lockedPairsViolated: 0,
      skillGapViolations: 0,
      skillGapDetails: [] as string[]
    };

    while (round <= NUM_ROUNDS) {

      players.forEach(p => {
        if (p.isLatecomer && p.sessionGamesPlayed >= p.catchUpTargetGames) {
          p.hasCaughtUp = true;
        }
      });

      const availableCourts = courts.filter(c => c.status === CourtStatus.OPEN);
      if (availableCourts.length === 0) break;

      const proposedBatches = buildNextBatches(players, availableCourts.length);
      const matchesToPlay = proposedBatches.map(b => pairFour(b));

      matchesToPlay.forEach((pm, idx) => {
        const court = availableCourts[idx];
        const matchId = `m_${round}_${idx}`;
        const tA = pm.teamA.map(p => p.id);
        const tB = pm.teamB.map(p => p.id);
        
        matches.push({
          id: matchId,
          courtId: court.id,
          teamA: tA,
          teamB: tB,
          startedAtEpochMs: Date.now(),
          endedAtEpochMs: null,
          winner: null,
          scoreA: null,
          scoreB: null
        });

        const allPlayersInMatch = [...pm.teamA, ...pm.teamB];
        const isLockedPairPresent = allPlayersInMatch.some(p => p.lockedPartnerId);
        
        pm.teamA.forEach(p => {
          if (p.lockedPartnerId && !tA.includes(p.lockedPartnerId)) metrics.lockedPairsViolated++;
        });
        pm.teamB.forEach(p => {
          if (p.lockedPartnerId && !tB.includes(p.lockedPartnerId)) metrics.lockedPairsViolated++;
        });

        if (!isLockedPairPresent) {
          const skills = allPlayersInMatch.map(p => p.skillLevel);
          const maxSkill = Math.max(...skills);
          const minSkill = Math.min(...skills);
          if (maxSkill - minSkill > 1.5) {
            metrics.skillGapViolations++;
            metrics.skillGapDetails.push(`Match ${matchId}: Max ${maxSkill}, Min ${minSkill}`);
          }
        }

        allPlayersInMatch.forEach(p => {
          const player = players.find(x => x.id === p.id)!;
          player.status = PlayerStatus.PLAYING;
          player.currentCourtId = court.id;
        });
      });

      matches.filter(m => !m.endedAtEpochMs).forEach(m => {
        m.endedAtEpochMs = Date.now() + 15 * 60000;
        const winner = Math.random() > 0.5 ? Team.A : Team.B;
        m.winner = winner;
        
        [...m.teamA, ...m.teamB].forEach(pid => {
          const p = players.find(x => x.id === pid)!;
          p.status = PlayerStatus.AVAILABLE;
          p.currentCourtId = null;
          p.sessionGamesPlayed++;
          p.queuedAtEpochMs = Date.now();
        });
      });

      round++;
    }

    const results = {
      totalPlayers: players.length,
      totalMatches: matches.length,
      metrics,
      rawMatches: matches.map(m => ({
        id: m.id,
        players: [...m.teamA, ...m.teamB].sort()
      })),
      players: players.map(p => ({
        id: p.id,
        name: p.name,
        isLatecomer: p.isLatecomer,
        skill: p.skillLevel,
        games: p.sessionGamesPlayed,
        locked: p.lockedPartnerId
      }))
    };

    fs.writeFileSync('simulation_results_3.json', JSON.stringify(results, null, 2));
  });
});
