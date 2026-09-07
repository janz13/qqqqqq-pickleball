'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
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
  const [isLoading, setIsLoading] = useState(true);
  const initRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    const setupSession = async () => {
      const state = useStore.getState();

      // If already in memory and matches this session ID
      if (state.session && state.session.id === sessionId) {
        if (state.currentUser && !state.currentUser.id.startsWith('guest_') && state.roster.length === 0) {
          state.syncCloudRoster(state.currentUser.id);
        }
        if (isMounted) setIsLoading(false);
        initRef.current = true;
        return;
      }

      // If not in local store, fetch from Supabase
      try {
        const { createClient } = await import('@/lib/supabase');
        const supabase = createClient();
        if (supabase) {
          const { data, error } = await supabase
            .from('sessions')
            .select('*')
            .eq('id', sessionId)
            .single();

          if (data && data.state_json && isMounted) {
            if (!data.is_active) {
              // Session has already ended, redirect to history analysis
              router.replace(`/history/${sessionId}`);
              return;
            }

            // Restore active cloud session into Zustand
            useStore.setState({
              session: data.state_json.session || {
                id: data.id,
                name: 'Pickleball Session',
                joinCode: data.join_code,
                ownerUid: data.owner_uid,
                createdAtEpochMs: data.updated_at ? new Date(data.updated_at).getTime() : Date.now(),
                isActive: true,
                courtsPerBatch: (data.state_json.courts || []).length || 4,
                queueBatchesShown: 2,
                showNextUpToPlayers: true
              },
              sessionId: data.id,
              joinCode: data.join_code,
              players: data.state_json.players || [],
              courts: data.state_json.courts || [],
              matches: data.state_json.matches || []
            });

            if (state.currentUser && !state.currentUser.id.startsWith('guest_')) {
              state.syncCloudRoster(state.currentUser.id);
            }

            initRef.current = true;
            setIsLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error("Failed to restore session from cloud:", err);
      }

      // If not found in cloud either, redirect home
      if (isMounted && !initRef.current) {
        router.replace('/');
      }
    };

    setupSession();

    return () => {
      isMounted = false;
    };
  }, [sessionId, router]);

  if (isLoading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-transparent">
        <div className="flex flex-col items-center gap-4 text-slate-500">
          <Loader2 size={48} className="animate-spin text-blue-500" />
          <p className="font-medium animate-pulse-soft">Loading Organizer Dashboard...</p>
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
