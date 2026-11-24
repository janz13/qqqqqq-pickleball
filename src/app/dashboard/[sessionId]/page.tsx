'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import CourtsPanel from '@/components/dashboard/CourtsPanel';
import RosterPanel from '@/components/dashboard/RosterPanel';
import LeaderboardPanel from '@/components/dashboard/LeaderboardPanel';
import MatchHistoryPanel from '@/components/dashboard/MatchHistoryPanel';
import TTSSettingsPanel from '@/components/dashboard/TTSSettingsPanel';
import AnnouncementPanel from '@/components/dashboard/AnnouncementPanel';
import TournamentPanel from '@/components/dashboard/TournamentPanel';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Loader2, Trophy, ArrowLeft, ShieldAlert } from 'lucide-react';
import { Player, Court, Match, Session } from '@/types/models';

export default function DashboardPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const router = useRouter();
  const { session, _hasHydrated } = useStore();
  const [isLoading, setIsLoading] = useState(true);
  const [errorState, setErrorState] = useState<'not_found' | 'forbidden' | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    const hydrated = useStore.persist?.hasHydrated?.() || _hasHydrated;
    if (!hydrated) return;

    let isMounted = true;

    const setupSession = async () => {
      const state = useStore.getState();

      // If already in memory, matches this session ID, and belongs to currentUser
      if (
        state.session &&
        state.session.id === sessionId &&
        state.currentUser &&
        state.session.ownerUid === state.currentUser.id
      ) {
        if (!state.currentUser.id.startsWith('guest_') && state.roster.length === 0) {
          void state.syncCloudRoster(state.currentUser.id);
        }
        if (isMounted) {
          setErrorState(null);
          setIsLoading(false);
        }
        initRef.current = true;
        return;
      }

      // Fetch via server-verified action enforcing owner_uid access control
      try {
        const { fetchDashboardSessionAction } = await import('@/app/actions');
        const res = await fetchDashboardSessionAction(sessionId, state.currentUser?.id);

        if (!isMounted) return;

        if (res.status === 'ended') {
          router.replace(`/history/${res.id}`);
          return;
        }

        if (res.status === 'forbidden') {
          setErrorState('forbidden');
          setIsLoading(false);
          return;
        }

        if (res.status === 'ok' && res.row.state_json) {
          const sj = res.row.state_json;
          const restoredSession: Session = (sj.session as Session | undefined) || {
            id: res.row.id,
            name: 'Pickleball Session',
            joinCode: res.row.join_code,
            ownerUid: res.row.owner_uid,
            createdAtEpochMs: res.row.updated_at ? new Date(res.row.updated_at).getTime() : Date.now(),
            isActive: true,
            courtsPerBatch: Array.isArray(sj.courts) ? sj.courts.length || 4 : 4,
            queueBatchesShown: 2,
            showNextUpToPlayers: true,
          };

          useStore.setState({
            session: restoredSession,
            sessionId: res.row.id,
            joinCode: res.row.join_code,
            players: (sj.players as Player[] | undefined) || [],
            courts: (sj.courts as Court[] | undefined) || [],
            matches: (sj.matches as Match[] | undefined) || [],
          });

          if (state.currentUser && !state.currentUser.id.startsWith('guest_')) {
            void state.syncCloudRoster(state.currentUser.id);
          }

          initRef.current = true;
          setErrorState(null);
          setIsLoading(false);
          return;
        }
      } catch (err) {
        console.error('Failed to restore session from cloud:', err);
      }

      if (isMounted && !initRef.current) {
        setErrorState('not_found');
        setIsLoading(false);
      }
    };

    void setupSession();

    return () => {
      isMounted = false;
    };
  }, [sessionId, router, _hasHydrated]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="flex flex-col items-center gap-4 text-slate-500">
          <Loader2 size={48} className="animate-spin text-blue-500" />
          <p className="font-medium animate-pulse-soft">Loading Organizer Dashboard...</p>
        </div>
      </div>
    );
  }

  if (errorState || !session) {
    const isForbidden = errorState === 'forbidden';
    return (
      <div className="dark min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="glass-dark max-w-md w-full p-8 rounded-3xl border border-white/10 text-center space-y-5 shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center mx-auto">
            {isForbidden ? <ShieldAlert size={30} className="text-amber-400" /> : <Trophy size={30} className="text-slate-400" />}
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-black tracking-tight">
              {isForbidden ? 'Organizer Access Required' : 'Session Not Found'}
            </h1>
            <p className="text-slate-400 text-sm">
              {isForbidden
                ? 'Please sign in with the organizer account that owns this session to open the dashboard.'
                : 'This organizer session could not be found or may have been deleted.'}
            </p>
          </div>
          <Link
            href="/"
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-colors duration-150 inline-flex items-center justify-center gap-2"
          >
            <ArrowLeft size={16} /> Back to Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      {(activeTab) => (
        <div className="h-full">
          {activeTab === 'courts' && (session.sessionType && session.sessionType !== 'OPEN_PLAY' ? <TournamentPanel /> : <CourtsPanel />)}
          {activeTab === 'roster' && <RosterPanel />}
          {activeTab === 'leaderboard' && <LeaderboardPanel />}
          {activeTab === 'history' && <MatchHistoryPanel />}
          {activeTab === 'announcements' && <AnnouncementPanel />}
          {activeTab === 'settings' && <TTSSettingsPanel />}
        </div>
      )}
    </DashboardLayout>
  );
}
