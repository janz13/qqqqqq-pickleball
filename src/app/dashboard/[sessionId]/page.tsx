'use client';

import { useEffect, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/lib/store';
import { CourtStatus, Session } from '@/types/models';
import CourtsPanel from '@/components/dashboard/CourtsPanel';
import RosterPanel from '@/components/dashboard/RosterPanel';
import LeaderboardPanel from '@/components/dashboard/LeaderboardPanel';
import MatchHistoryPanel from '@/components/dashboard/MatchHistoryPanel';
import TTSSettingsPanel from '@/components/dashboard/TTSSettingsPanel';
import AnnouncementPanel from '@/components/dashboard/AnnouncementPanel';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { Loader2 } from 'lucide-react';

export default function DashboardPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const router = useRouter();
  const { session } = useStore();
  const initRef = useRef(false);

  useEffect(() => {
    const state = useStore.getState();
    if (!state.session || state.session.id !== sessionId) {
      // Not found or session ended, go home if not already navigating
      if (!initRef.current) {
         router.push('/');
      }
      return;
    }
    initRef.current = true;

    if (state.currentUser && !state.currentUser.id.startsWith('guest_') && state.roster.length === 0) {
      state.syncCloudRoster(state.currentUser.id);
    }
  }, [session, sessionId, router]);

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="flex flex-col items-center gap-4 text-slate-500">
          <Loader2 size={48} className="animate-spin text-blue-500" />
          <p className="font-medium animate-pulse-soft">Initializing Session...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout>
      {(activeTab) => (
        <div className="h-full">
          {activeTab === 'courts' && <CourtsPanel />}
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
