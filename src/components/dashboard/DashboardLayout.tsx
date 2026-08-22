'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import { LayoutDashboard, Users, Trophy, Settings, Megaphone } from 'lucide-react';
import QRCodeDisplay from '@/components/ui/QRCodeDisplay';
import ThemeToggle from '@/components/ui/ThemeToggle';

type Tab = 'courts' | 'roster' | 'leaderboard' | 'announcements' | 'settings';

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
  const endSession = useStore(state => state.endSession);
  const router = useRouter();

  const handleEndSession = () => {
    const sid = session?.id;
    router.push('/history/' + sid);
    setTimeout(() => {
      endSession();
    }, 100);
  };

  const tabs = [
    { id: 'courts', label: 'Courts', icon: LayoutDashboard },
    { id: 'roster', label: 'Roster', icon: Users },
    { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
    { id: 'announcements', label: 'Announce', icon: Megaphone },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 glass dark:glass-dark m-4 mr-0 rounded-2xl overflow-hidden z-10 animate-fade-in">
        <div className="p-6 border-b border-slate-200/50 dark:border-slate-700/50">
          <div className="flex justify-between items-center mb-3">
            <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-slate-100 break-words">
              {session?.name || 'Pickleball Session'}
            </h1>
            <ThemeToggle />
          </div>
          {session?.joinCode && (
            <div className="flex flex-col gap-2">
              <button 
                onClick={() => setShowQR(true)}
                className="px-3 py-1.5 w-full bg-gradient-to-r from-blue-500/10 to-indigo-500/10 hover:from-blue-500/20 hover:to-indigo-500/20 text-blue-700 dark:text-blue-300 rounded-lg text-sm font-semibold transition-all duration-200 border border-blue-500/20 shadow-sm"
              >
                Code: <span className="tracking-widest">{session.joinCode}</span>
              </button>
              <button 
                onClick={() => window.open(`/session/${session.joinCode}`, '_blank')}
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
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                  isActive 
                    ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md shadow-blue-500/20 scale-[1.02]' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-100'
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
        {/* Mobile Header */}
        <div className="md:hidden p-4 flex justify-between items-center bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 z-10 sticky top-0">
          <h1 className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100 break-words pr-2">
            {session?.name || 'Pickleball Session'}
          </h1>
          <ThemeToggle />
        </div>
        
        <div className="max-w-7xl w-full mx-auto p-4 md:p-8 pb-24 md:pb-0">
          {children(activeTab)}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 glass dark:glass-dark rounded-t-2xl rounded-b-none border-t border-white/20 pb-safe z-50">
        <div className="flex justify-around items-center h-16 px-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex flex-col items-center justify-center w-full h-full space-y-1"
              >
                <div className={`p-1.5 rounded-full transition-all duration-200 ${isActive ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400' : 'text-slate-500 dark:text-slate-400'}`}>
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                {isActive && <div className="w-1 h-1 rounded-full bg-blue-600 dark:bg-blue-400" />}
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
                <span className="text-xl font-bold">{matches.length}</span>
              </div>
              <div className="flex justify-between items-center bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                <span className="font-semibold">Total Players:</span>
                <span className="text-xl font-bold">{players.length}</span>
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
