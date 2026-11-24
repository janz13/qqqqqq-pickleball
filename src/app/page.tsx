'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Users, Shuffle, Trophy, ArrowRight, Mail, LogOut, History, Loader2, Trash2, AlertCircle } from 'lucide-react';
import { useStore } from '@/lib/store';
import Link from 'next/link';
import ThemeToggle from '@/components/ui/ThemeToggle';
import BrandMark from '@/components/ui/BrandMark';
import type { CloudSessionRow } from '@/app/actions';

export default function HomePage() {
  const [joinCode, setJoinCode] = useState('');
  const [authMode, setAuthMode] = useState<'initial' | 'email'>('initial');
  const [authTab, setAuthTab] = useState<'signin' | 'register'>('signin');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState(false);
  const [roamingHistory, setRoamingHistory] = useState<CloudSessionRow[]>([]);
  const [loadedOwnerId, setLoadedOwnerId] = useState<string | null>(null);
  const [hasMoreSessions, setHasMoreSessions] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const router = useRouter();
  const { currentUser, setCurrentUser, sessionHistory, session, syncCloudRoster } = useStore();
  const isLoadingSessions = Boolean(
    currentUser && !currentUser.id.startsWith('guest_') && loadedOwnerId !== currentUser.id
  );

  useEffect(() => {
    let isMounted = true;
    if (currentUser && !currentUser.id.startsWith('guest_')) {
      const uid = currentUser.id;
      const fetchSessions = async () => {
        try {
          const { fetchOwnerSessionsAction } = await import('@/app/actions');
          const res = await fetchOwnerSessionsAction(uid, 25, 0);
          if (isMounted) {
            setRoamingHistory(res.sessions);
            setHasMoreSessions(res.hasMore);
            setLoadedOwnerId(uid);
            setHistoryError(res.error || null);
          }
        } catch (err) {
          console.error('Failed to load sessions:', err);
          if (isMounted) setLoadedOwnerId(uid);
        }
      };

      void fetchSessions();
      void syncCloudRoster(uid);
    }
    return () => {
      isMounted = false;
    };
  }, [currentUser, syncCloudRoster]);

  const handleLoadMoreSessions = async () => {
    if (!currentUser || currentUser.id.startsWith('guest_') || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const { fetchOwnerSessionsAction } = await import('@/app/actions');
      const res = await fetchOwnerSessionsAction(currentUser.id, 25, roamingHistory.length);
      setRoamingHistory(prev => {
        const merged = new Map<string, CloudSessionRow>();
        prev.forEach(r => merged.set(r.id, r));
        res.sessions.forEach(r => merged.set(r.id, r));
        return Array.from(merged.values());
      });
      setHasMoreSessions(res.hasMore);
    } catch (err) {
      console.error('Failed to load more sessions:', err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim().length > 0) {
      router.push(`/session/${joinCode.toUpperCase()}`);
    }
  };

  const handleCustomLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const uname = username.trim().toLowerCase();

    if (authTab === 'register') {
      if (uname.length < 3 || password.length < 8) {
        setAuthError('Username must be 3+ characters and password at least 8 characters.');
        return;
      }
    } else if (uname.length < 3 || password.length < 1) {
      setAuthError('Please enter your username and password.');
      return;
    }

    setIsSubmittingAuth(true);
    try {
      const { loginOrganizer, registerOrganizer } = await import('@/app/actions');
      const res = authTab === 'register'
        ? await registerOrganizer(uname, password)
        : await loginOrganizer(uname, password);

      if (res.error) {
        setAuthError(res.error);
      } else if (res.success) {
        setCurrentUser({ email: res.username || uname, id: res.username || uname });
        setAuthMode('initial');
        setPassword('');
      }
    } catch (err) {
      console.error(err);
      setAuthError('An error occurred during authentication.');
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 selection:bg-blue-500/30 overflow-hidden relative">
      <div className="w-full max-w-md animate-slide-up">
        <div className="flex items-center justify-end gap-2 mb-4">
          <Link
            href="/leaderboard"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-700 dark:text-gray-200 hover:border-amber-400 transition-colors shadow-sm"
          >
            <Trophy size={14} className="text-amber-500" />
            Leaderboard
          </Link>
          <ThemeToggle />
        </div>
        <div className="text-center mb-10">
          <div className="w-24 h-24 rounded-[2rem] mx-auto mb-8 flex items-center justify-center shadow-lg shadow-emerald-600/20 rotate-2 transition-transform duration-150 hover:rotate-0">
            <BrandMark size={96} />
          </div>
          <h1 className="text-5xl sm:text-6xl font-black text-gray-900 dark:text-gray-100 tracking-tighter mb-4">
            QQQQQQ
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 font-medium">
            Smart pickleball queue management
          </p>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-[2.5rem] p-8 space-y-8 shadow-sm border border-gray-200 dark:border-gray-800">
          
          {authMode === 'initial' && !currentUser && (
            <>
              <form onSubmit={handleJoin} className="space-y-4">
                <label htmlFor="join-session-code" className="block text-sm font-bold text-gray-700 dark:text-gray-300 ml-2 uppercase tracking-wider">
                  Join a Session
                </label>
                <div className="flex gap-3">
                  <input 
                    id="join-session-code"
                    aria-label="Session Join Code"
                    type="text" 
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="Enter Code"
                    maxLength={6}
                    className="flex-grow px-6 min-h-[64px] text-2xl font-mono font-black tracking-widest text-center rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all uppercase placeholder:normal-case placeholder:font-sans placeholder:font-medium placeholder:tracking-normal placeholder:text-gray-400 text-gray-900 dark:text-gray-100"
                  />
                  <button 
                    type="submit"
                    aria-label="Join session"
                    title="Join session"
                    disabled={joinCode.trim().length === 0}
                    className="px-6 min-h-[64px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-50 disabled:grayscale text-white rounded-2xl transition-transform duration-150 hover:scale-[1.03] active:scale-95 flex items-center justify-center shadow-md shadow-emerald-600/20"
                  >
                    <ArrowRight size={28} strokeWidth={3} />
                  </button>
                </div>
              </form>

              <div className="relative flex items-center py-2">
                <div className="flex-grow border-t border-gray-200 dark:border-gray-800"></div>
                <span className="flex-shrink-0 mx-4 text-gray-400 font-bold text-sm tracking-widest uppercase">OR</span>
                <div className="flex-grow border-t border-gray-200 dark:border-gray-800"></div>
              </div>

              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => setAuthMode('email')}
                  className="w-full min-h-[64px] bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 font-bold text-lg rounded-2xl flex items-center justify-center gap-3 transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99] shadow-sm"
                >
                  <Mail size={22} />
                  Login to Organize
                </button>
                
                <button 
                  onClick={() => {
                    const guestId = 'guest_' + Date.now().toString(36);
                    setCurrentUser({ email: 'Guest Organizer', id: guestId });
                    void import('@/app/actions').then(({ loginGuestOrganizer }) => loginGuestOrganizer(guestId));
                    router.push('/dashboard/new');
                  }}
                  className="w-full min-h-[54px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-colors duration-150 shadow-sm"
                >
                  Organize as Guest
                </button>
              </div>
            </>
          )}

          {authMode === 'email' && !currentUser && (
            <form onSubmit={handleCustomLogin} className="space-y-5">
              <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('signin');
                    setAuthError(null);
                  }}
                  className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors duration-150 ${
                    authTab === 'signin'
                      ? 'bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('register');
                    setAuthError(null);
                  }}
                  className={`flex-1 py-2 text-sm font-bold rounded-lg transition-colors duration-150 ${
                    authTab === 'register'
                      ? 'bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  Create Account
                </button>
              </div>

              <div>
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                  {authTab === 'register' ? 'Create Organizer Account' : 'Organizer Sign In'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {authTab === 'register'
                    ? 'Choose a username (3+ chars) and a strong password (minimum 8 characters) to sync rosters and sessions.'
                    : 'Sign in with your organizer username and password to resume sessions and access cloud rosters.'}
                </p>
              </div>

              {authError && (
                <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs font-semibold flex items-start gap-2">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </div>
              )}
              
              <div className="space-y-4">
                <input 
                  type="text" 
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="Username (e.g. jsmith)"
                  required
                  className="w-full px-6 min-h-[64px] text-lg font-medium rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-gray-900 dark:text-gray-100"
                />
                <input 
                  type="password" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={authTab === 'register' ? 'Password (min 8 characters)' : 'Password'}
                  minLength={authTab === 'register' ? 8 : undefined}
                  required
                  className="w-full px-6 min-h-[64px] text-lg font-medium rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-gray-900 dark:text-gray-100"
                />
              </div>
              
              <div className="flex flex-col gap-3">
                <button 
                  type="submit"
                  disabled={isSubmittingAuth}
                  className="w-full min-h-[64px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 disabled:opacity-60 text-white font-bold text-lg rounded-2xl transition-colors duration-150 flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20"
                >
                  {isSubmittingAuth && <Loader2 size={18} className="animate-spin" />}
                  {authTab === 'register' ? 'Create Account' : 'Sign In'}
                </button>
                <button 
                  type="button"
                  onClick={() => {
                    setAuthMode('initial');
                    setAuthError(null);
                  }}
                  className="w-full min-h-[44px] text-gray-500 font-semibold text-sm hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {currentUser && (
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue-100 dark:border-blue-800/30">
                <div className="truncate pr-4">
                  <p className="text-xs text-blue-500 dark:text-blue-400 font-bold uppercase tracking-wider">Logged in as</p>
                  <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">{currentUser.email}</p>
                </div>
                <button type="button" aria-label="Log out" title="Log out" onClick={async () => { setCurrentUser(null); setRoamingHistory([]); setLoadedOwnerId(null); try { const { logoutOrganizer } = await import('@/app/actions'); await logoutOrganizer(); } catch {} }} className="p-3 bg-white dark:bg-gray-800 text-gray-400 hover:text-red-500 rounded-xl transition-colors shadow-sm">
                  <LogOut size={20} />
                </button>
              </div>

              {(() => {
                const cloudActive = roamingHistory.find(
                  r => r.is_active && r.owner_uid === currentUser.id && !r.state_json?.session?.deleted
                );
                const localActive = (session && session.isActive && session.ownerUid === currentUser.id) ? session : null;
                const activeSession = localActive || cloudActive;
                if (!activeSession) return null;
                const activeName =
                  ('name' in activeSession ? activeSession.name : undefined) ||
                  cloudActive?.state_json?.session?.name ||
                  'Current';

                return (
                  <Link 
                    href={`/dashboard/${activeSession.id}`}
                    className="w-full min-h-[64px] bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold text-lg rounded-2xl flex items-center justify-center gap-3 transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99] shadow-md shadow-emerald-600/20"
                  >
                    <Play size={22} fill="currentColor" />
                    Resume Active Session ({activeName})
                  </Link>
                );
              })()}

              <Link 
                href="/dashboard/new"
                className="w-full min-h-[64px] bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 font-bold text-lg rounded-2xl flex items-center justify-center gap-3 transition-transform duration-150 hover:scale-[1.01] active:scale-[0.99] shadow-sm"
              >
                <Play size={22} fill="currentColor" />
                Create New Session
              </Link>

              {(() => {
                interface CombinedSessionEntry {
                  id: string;
                  join_code: string;
                  name: string;
                  updated_at: string;
                  created_at: string;
                  is_active: boolean;
                  matches_count: number;
                  players_count: number;
                  is_local: boolean;
                }

                const combinedSessions: CombinedSessionEntry[] = Array.from(new Map(
                  [
                    ...roamingHistory
                      .filter(r => r.owner_uid === currentUser.id && !r.state_json?.session?.deleted)
                      .map((r): CombinedSessionEntry => ({
                        id: r.id,
                        join_code: r.join_code,
                        name: r.state_json?.session?.name || ('Session ' + r.join_code),
                        updated_at: r.updated_at,
                        created_at: r.state_json?.session?.createdAtEpochMs
                          ? new Date(r.state_json.session.createdAtEpochMs).toISOString()
                          : r.updated_at,
                        is_active: r.is_active,
                        matches_count: r.state_json?.matches?.length || 0,
                        players_count: r.state_json?.players?.length || 0,
                        is_local: false
                      })),
                    ...sessionHistory
                      .filter(h => h.session && h.session.ownerUid === currentUser.id)
                      .map((h): CombinedSessionEntry => ({
                        id: h.session.id,
                        join_code: h.session.joinCode,
                        name: h.session.name || ('Session ' + h.session.joinCode),
                        updated_at: new Date(h.endedAtEpochMs).toISOString(),
                        created_at: new Date(h.session.createdAtEpochMs).toISOString(),
                        is_active: false,
                        matches_count: h.matches?.length || 0,
                        players_count: h.players?.length || 0,
                        is_local: true
                      }))
                  ].map(s => [s.id, s])
                ).values())
                .sort((a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime());

                return (
                  <div className="pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                        <History size={16} /> My Sessions ({combinedSessions.length})
                      </h3>
                      {isLoadingSessions && <Loader2 size={16} className="animate-spin text-blue-500" />}
                    </div>

                    {historyError && (
                      <div role="alert" className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-200 text-xs font-semibold">
                        {historyError}
                      </div>
                    )}

                    {isLoadingSessions && roamingHistory.length === 0 ? (
                      <div className="py-6 flex flex-col items-center justify-center gap-2 text-gray-500 text-sm bg-gray-50 dark:bg-gray-800 rounded-2xl">
                        <Loader2 size={22} className="animate-spin text-blue-500" />
                        <span>Loading your past sessions...</span>
                      </div>
                    ) : combinedSessions.length === 0 ? (
                      <div className="bg-gray-50 dark:bg-gray-800 p-6 rounded-2xl text-center border border-gray-200 dark:border-gray-700">
                        <p className="font-semibold text-gray-700 dark:text-gray-300">No sessions yet</p>
                        <p className="text-xs text-gray-500 mt-1">Start your first session above to track games, players, and all-time stats.</p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-2">
                        {combinedSessions.map((item) => {
                          const isActiveSession = item.is_active;
                          const sessionHref = isActiveSession ? `/dashboard/${item.id}` : `/history/${item.id}`;

                          return (
                            <div key={item.id} className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl flex justify-between items-center border border-gray-200 dark:border-gray-700 group hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors duration-150">
                              <Link 
                                href={sessionHref}
                                className="flex-1 hover:opacity-75 transition-opacity"
                              >
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-bold text-gray-900 dark:text-gray-100">{item.name}</p>
                                  {isActiveSession ? (
                                    <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider animate-pulse-soft">Active</span>
                                  ) : (
                                    <span className="text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Ended</span>
                                  )}
                                  {item.is_local && <span className="text-[10px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Local</span>}
                                </div>
                                <p className="text-xs text-gray-500 tabular-nums mt-0.5">
                                  {new Date(item.updated_at || item.created_at).toLocaleDateString()} • Code: <span className="font-mono font-semibold">{item.join_code}</span> • {item.matches_count} matches • {item.players_count} players
                                </p>
                              </Link>
                              
                              <div className="flex items-center gap-1">
                                <Link
                                  href={`/session/${item.join_code}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-2 text-gray-400 hover:text-blue-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                  title="Open Player View"
                                >
                                  <Users size={16} />
                                </Link>

                                <button 
                                  onClick={async () => {
                                    if (!confirm(`Are you sure you want to delete session "${item.name}" permanently?`)) {
                                      return;
                                    }
                                    setHistoryError(null);
                                    if (!item.is_local || roamingHistory.some(r => r.id === item.id)) {
                                      const { deleteSessionAction } = await import('@/app/actions');
                                      const res = await deleteSessionAction(item.id, currentUser.id);
                                      if (res.error) {
                                        setHistoryError(res.error);
                                        return;
                                      }
                                      setRoamingHistory(prev => prev.filter(s => s.id !== item.id));
                                    }
                                    useStore.setState(state => ({
                                      sessionHistory: state.sessionHistory.filter(h => h.session.id !== item.id),
                                      ...(state.session?.id === item.id ? {
                                        session: null,
                                        sessionId: null,
                                        joinCode: null,
                                        players: [],
                                        courts: [],
                                        matches: []
                                      } : {})
                                    }));
                                  }}
                                  className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                  title="Delete Session"
                                  aria-label={`Delete Session ${item.name}`}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {hasMoreSessions && (
                          <button
                            type="button"
                            onClick={handleLoadMoreSessions}
                            disabled={isLoadingMore}
                            className="mt-1 py-2 text-xs font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded-xl transition-colors"
                          >
                            {isLoadingMore ? 'Loading more...' : 'Load older sessions'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        <div className="mt-12 grid gap-4 max-w-sm mx-auto">
          <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl flex items-center gap-4 shadow-sm border border-gray-200 dark:border-gray-800">
            <div className="p-3 bg-gradient-to-br from-blue-400 to-blue-500 text-white rounded-xl shrink-0 shadow-sm">
              <Shuffle size={20} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">Smart Pairing</h3>
              <p className="text-xs text-gray-500 font-medium">Guarantees maximum variety.</p>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl flex items-center gap-4 shadow-sm border border-gray-200 dark:border-gray-800">
            <div className="p-3 bg-gradient-to-br from-emerald-400 to-teal-500 text-white rounded-xl shrink-0 shadow-sm">
              <Users size={20} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">Duo Queue</h3>
              <p className="text-xs text-gray-500 font-medium">Lock in with a partner.</p>
            </div>
          </div>
          <div className="bg-white dark:bg-gray-900 p-4 rounded-2xl flex items-center gap-4 shadow-sm border border-gray-200 dark:border-gray-800">
            <div className="p-3 bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-xl shrink-0 shadow-sm">
              <Trophy size={20} />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">Live Leaderboards</h3>
              <p className="text-xs text-gray-500 font-medium">Track wins and percentages.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

