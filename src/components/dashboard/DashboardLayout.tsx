'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { SessionType } from '@/types/models';
import { LayoutDashboard, Users, Trophy, Settings, Megaphone, ClipboardList, LucideIcon, AlertTriangle, X } from 'lucide-react';
import QRCodeDisplay from '@/components/ui/QRCodeDisplay';
import ThemeToggle from '@/components/ui/ThemeToggle';

type Tab = 'courts' | 'roster' | 'leaderboard' | 'history' | 'announcements' | 'settings';

interface DashboardLayoutProps {
  children: (activeTab: Tab) => React.ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [activeTab, setActiveTab] = useState<Tab>('courts');
  const [showQR, setShowQR] = useState(false);
  const [showEndSession, setShowEndSession] = useState(false);
  const session = useStore(state => state.session);
  const players = useStore(state => state.players);
  const matches = useStore(state => state.matches);
  const syncError = useStore(state => state.syncError);
  const clearSyncError = useStore(state => state.clearSyncError);
  const endSession = useStore(state => state.endSession);
  const router = useRouter();

  const handleEndSession = async () => {
    const sid = session?.id;
    await endSession();
    if (sid) {
      router.push('/history/' + sid);
    } else {
      router.push('/');
    }
  };

  const isTournament = session?.sessionType && session.sessionType !== SessionType.OPEN_PLAY;

  const tabs: { id: Tab; label: string; shortLabel: string; icon: LucideIcon }[] = [
    { id: 'courts', label: isTournament ? 'Tournament' : 'Courts', shortLabel: isTournament ? 'Tourney' : 'Courts', icon: LayoutDashboard },
    { id: 'roster', label: 'Roster', shortLabel: 'Roster', icon: Users },
    { id: 'leaderboard', label: 'Leaderboard', shortLabel: 'Ranks', icon: Trophy },
    { id: 'history', label: 'History', shortLabel: 'History', icon: ClipboardList },
    { id: 'announcements', label: 'Announce', shortLabel: 'Announce', icon: Megaphone },
    { id: 'settings', label: 'Settings', shortLabel: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 glass dark:glass-dark m-4 mr-0 rounded-2xl overflow-hidden z-10 animate-fade-in">
        <div className="p-6 border-b border-slate-200/50 dark:border-slate-700/50">
          <div className="flex justify-between items-start gap-2 mb-3">
            <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100 break-words line-clamp-2 flex-1 min-w-0">
              {session?.name || 'Pickleball Session'}
            </h1>
            <div className="shrink-0 pt-0.5">
              <ThemeToggle />
            </div>
          </div>
          {session?.joinCode && (
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => setShowQR(true)}
                className="px-3 py-1.5 w-full bg-gradient-to-r from-emerald-500/10 to-teal-500/10 hover:from-emerald-500/20 hover:to-teal-500/20 text-emerald-700 dark:text-emerald-300 rounded-lg text-sm font-semibold transition-colors duration-150 border border-emerald-500/20 shadow-sm"
              >
                Code: <span className="tracking-widest font-mono tabular-nums">{session.joinCode}</span>
              </button>
              <button 
                onClick={() => window.open(`/session/${session.joinCode}?preview=1`, '_blank', 'noopener,noreferrer')}
                className="px-3 py-1.5 w-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-semibold transition-colors flex items-center justify-center gap-2"
              >
                View as Player
              </button>
            </div>
          )}
        </div>
        
        <nav className="flex-1 px-4 py-6 space-y-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-colors duration-150 ${
                  isActive 
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-600/20' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon size={20} className={isActive ? 'text-white' : ''} />
                <span className="font-medium">{tab.label}</span>
              </button>
            );
          })}
        </nav>
        
        <div className="p-4 border-t border-slate-200/50 dark:border-slate-700/50">
          <button
            onClick={() => setShowEndSession(true)}
            className="w-full py-2 bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400 dark:hover:bg-red-900/60 rounded-xl font-bold transition-colors"
          >
            End Session
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-y-auto overflow-x-hidden animate-fade-in z-0 relative">
        {syncError && (
          <div role="alert" className="mx-4 mt-4 lg:mx-8 bg-rose-50 dark:bg-rose-950/90 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 px-4 py-3 rounded-2xl shadow-md flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <AlertTriangle size={18} className="shrink-0" />
              <span>{syncError}</span>
            </div>
            <button
              type="button"
              onClick={clearSyncError}
              aria-label="Dismiss sync error"
              className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors shrink-0"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {/* Mobile & Tablet Header */}
        <div className="lg:hidden p-4 flex flex-col gap-3 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 z-10 sticky top-0">
          <div className="flex justify-between items-start gap-2">
            <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100 break-words flex-1 min-w-0">
              {session?.name || 'Pickleball Session'}
            </h1>
            <div className="shrink-0 flex items-center gap-2 pt-0.5">
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setShowEndSession(true)}
                className="px-2.5 py-1.5 bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400 rounded-lg text-xs font-bold transition-colors"
              >
                End
              </button>
            </div>
          </div>
          {session?.joinCode && (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowQR(true)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-emerald-500/10 to-teal-500/10 hover:from-emerald-500/20 hover:to-teal-500/20 text-emerald-700 dark:text-emerald-300 rounded-xl text-sm font-bold transition-colors border border-emerald-500/20"
              >
                Code: <span className="tracking-widest font-mono tabular-nums text-base">{session.joinCode}</span>
              </button>
              <button 
                onClick={() => window.open(`/session/${session.joinCode}?preview=1`, '_blank', 'noopener,noreferrer')}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors"
              >
                Player View
              </button>
            </div>
          )}
        </div>
        
        <div className="max-w-7xl w-full mx-auto p-4 lg:p-8 pb-24 lg:pb-8">
          {children(activeTab)}
        </div>
      </main>

      {/* Mobile & Tablet Bottom Navigation */}
      <nav aria-label="Dashboard navigation" className="lg:hidden fixed bottom-0 left-0 right-0 glass dark:glass-dark rounded-t-2xl rounded-b-none border-t border-slate-200/80 dark:border-slate-700/70 pb-safe z-50">
        <div className="grid grid-cols-6 items-center h-16 px-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-label={tab.label}
                title={tab.label}
                className={`flex flex-col items-center justify-center h-full gap-0.5 px-1 transition-colors duration-150 ${
                  isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <div className={`px-2.5 py-1 rounded-full transition-colors duration-150 ${isActive ? 'bg-emerald-100 dark:bg-emerald-900/40' : ''}`}>
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={`text-[10px] leading-none truncate max-w-full ${isActive ? 'font-bold' : 'font-medium'}`}>
                  {tab.shortLabel}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* QR Modal */}
      {showQR && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowQR(false)}>
          <div className="w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <QRCodeDisplay joinCode={session?.joinCode} onClose={() => setShowQR(false)} />
          </div>
        </div>,
        document.body
      )}

      {/* End Session Modal */}
      {showEndSession && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowEndSession(false)}>
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-xl border border-gray-200 dark:border-gray-800" onClick={e => e.stopPropagation()}>
            <h2 className="text-2xl font-bold mb-4 text-gray-900 dark:text-gray-100">Session Summary</h2>
            <div className="space-y-4 mb-6 text-gray-700 dark:text-gray-300">
              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <span className="font-semibold">Total Matches Played:</span>
                <span className="text-xl font-bold tabular-nums">{matches.length + (session?.tournamentState?.matches.filter(m => m.status === 'COMPLETED').length || 0)}</span>
              </div>
              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <span className="font-semibold">Total Players:</span>
                <span className="text-xl font-bold tabular-nums">{players.length}</span>
              </div>
              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <span className="font-semibold">Top Player:</span>
                <span className="text-lg font-bold">
                  {players.length > 0 ? players.reduce((prev, current) => (prev.sessionWins > current.sessionWins) ? prev : current).name : 'N/A'}
                </span>
              </div>
            </div>
            <div className="flex gap-3 justify-end mt-4">
              <button onClick={() => setShowEndSession(false)} className="px-4 py-2 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg font-medium transition-colors">
                Cancel
              </button>
              <button onClick={handleEndSession} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors">
                Confirm End Session
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
