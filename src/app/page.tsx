'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, Users, Shuffle, Trophy, ArrowRight, LayoutGrid, Mail, LogOut, History, ChevronRight } from 'lucide-react';
import { useStore } from '@/lib/store';
import Link from 'next/link';

export default function HomePage() {
  const [joinCode, setJoinCode] = useState('');
  const [authMode, setAuthMode] = useState<'initial' | 'email' | 'otp'>('initial');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [mockSentOTP, setMockSentOTP] = useState('');
  
  const router = useRouter();
  const { currentUser, setCurrentUser, sessionHistory } = useStore();
  const supabase = typeof window !== 'undefined' ? (require('@/lib/supabase').createClient()) : null;

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (joinCode.trim().length > 0) {
      router.push(`/session/${joinCode.toUpperCase()}`);
    }
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (email.includes('@')) {
      if (supabase) {
        const { error } = await supabase.auth.signInWithOtp({ email });
        if (error) {
          alert(`Error sending email: ${error.message}`);
          return;
        }
        setAuthMode('otp');
      } else {
        // Fallback for local testing without Supabase
        const generatedOTP = Math.floor(100000 + Math.random() * 900000).toString();
        setMockSentOTP(generatedOTP);
        setAuthMode('otp');
        alert(`DEVELOPMENT MODE: Your login passcode is ${generatedOTP}`);
      }
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (supabase) {
      const { data, error } = await supabase.auth.verifyOtp({ email, token: otp, type: 'email' });
      if (error || !data.user) {
        alert("Invalid passcode.");
      } else {
        setCurrentUser({
          email: data.user.email || email,
          id: data.user.id
        });
        setAuthMode('initial');
      }
    } else {
      if (otp === mockSentOTP) {
        setCurrentUser({
          email,
          id: email.toLowerCase()
        });
        setAuthMode('initial');
      } else {
        alert("Invalid passcode.");
      }
    }
  };

  const myHistory = sessionHistory.filter(h => h.session.ownerUid === currentUser?.id);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 selection:bg-blue-500/30 overflow-hidden relative">
      <div className="w-full max-w-md animate-slide-up">
        <div className="text-center mb-10">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-[2rem] mx-auto mb-8 flex items-center justify-center shadow-lg rotate-3 transition-transform hover:rotate-6">
            <LayoutGrid className="w-12 h-12 text-white" strokeWidth={2.5} />
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
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 ml-2 uppercase tracking-wider">
                  Join a Session
                </label>
                <div className="flex gap-3">
                  <input 
                    type="text" 
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="Enter Code"
                    maxLength={6}
                    className="flex-grow px-6 min-h-[64px] text-2xl font-mono font-black tracking-widest text-center rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all uppercase placeholder:normal-case placeholder:font-sans placeholder:font-medium placeholder:tracking-normal placeholder:text-gray-400 text-gray-900 dark:text-gray-100"
                  />
                  <button 
                    type="submit"
                    disabled={joinCode.trim().length === 0}
                    className="px-6 min-h-[64px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 disabled:grayscale text-white rounded-2xl transition-all hover:scale-[1.05] active:scale-95 flex items-center justify-center shadow-md"
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
                  className="w-full min-h-[64px] bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 font-bold text-lg rounded-2xl flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 shadow-sm"
                >
                  <Mail size={22} />
                  Login to Organize
                </button>
                
                <Link 
                  href="/dashboard/new"
                  className="w-full min-h-[54px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-sm rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  Organize as Guest
                </Link>
              </div>
            </>
          )}

          {authMode === 'email' && !currentUser && (
            <form onSubmit={handleSendOTP} className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Sign In</h2>
              <p className="text-sm text-gray-500">Enter your email to receive a login passcode.</p>
              
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                className="w-full px-6 min-h-[64px] text-lg font-medium rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-gray-900 dark:text-gray-100"
              />
              
              <div className="flex flex-col gap-3">
                <button 
                  type="submit"
                  className="w-full min-h-[64px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-lg rounded-2xl transition-all hover:scale-[1.02] active:scale-95 shadow-md"
                >
                  Send Passcode
                </button>
                <button 
                  type="button"
                  onClick={() => setAuthMode('initial')}
                  className="w-full min-h-[44px] text-gray-500 font-semibold text-sm hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {authMode === 'otp' && !currentUser && (
            <form onSubmit={handleVerifyOTP} className="space-y-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Enter Passcode</h2>
              <p className="text-sm text-gray-500">We sent a passcode to {email}. (Check alert!)</p>
              
              <input 
                type="text" 
                value={otp}
                onChange={e => setOtp(e.target.value)}
                placeholder="123456"
                required
                maxLength={6}
                className="w-full px-6 min-h-[64px] text-3xl font-mono tracking-[0.5em] text-center font-bold rounded-2xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-gray-900 dark:text-gray-100"
              />
              
              <div className="flex flex-col gap-3">
                <button 
                  type="submit"
                  className="w-full min-h-[64px] bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-lg rounded-2xl transition-all hover:scale-[1.02] active:scale-95 shadow-md"
                >
                  Login
                </button>
                <button 
                  type="button"
                  onClick={() => setAuthMode('email')}
                  className="w-full min-h-[44px] text-gray-500 font-semibold text-sm hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Back
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
                <button onClick={() => setCurrentUser(null)} className="p-3 bg-white dark:bg-gray-800 text-gray-400 hover:text-red-500 rounded-xl transition-colors shadow-sm">
                  <LogOut size={20} />
                </button>
              </div>

              <Link 
                href="/dashboard/new"
                className="w-full min-h-[64px] bg-gray-900 hover:bg-gray-800 dark:bg-gray-100 dark:hover:bg-white text-white dark:text-gray-900 font-bold text-lg rounded-2xl flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-95 shadow-sm"
              >
                <Play size={22} fill="currentColor" />
                Create New Session
              </Link>

              {myHistory.length > 0 && (
                <div className="pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <History size={16} /> My Past Sessions
                    </h3>
                    <Link href="/leaderboard" className="text-xs font-bold text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-900/20 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors">
                      <Trophy size={14} /> Global Leaderboard
                    </Link>
                  </div>
                  <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-2">
                    {myHistory.slice().reverse().map(h => (
                      <Link 
                        key={h.session.id} 
                        href={`/history/${h.session.id}`}
                        className="bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 p-4 rounded-xl flex justify-between items-center transition-colors border border-gray-200 dark:border-gray-700"
                      >
                        <div>
                          <p className="font-bold text-gray-900 dark:text-gray-100">{h.session.name}</p>
                          <p className="text-xs text-gray-500">{new Date(h.session.createdAtEpochMs).toLocaleDateString()}</p>
                        </div>
                        <ChevronRight className="text-gray-400" size={18} />
                      </Link>
                    ))}
                  </div>
                </div>
              )}
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
