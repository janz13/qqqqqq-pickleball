import os

base_dir = r"C:\Users\test\Downloads\QQQQQQ\QQQQQQ\web\src"

def rewrite_file(path, content):
    with open(os.path.join(base_dir, path), "w", encoding="utf-8") as f:
        f.write(content)

# 1. globals.css
rewrite_file(r"../app/globals.css", """@import "tailwindcss";

@keyframes slide-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes pulse-soft { 0%, 100% { opacity: 1; } 50% { opacity: 0.7; } }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

.animate-slide-up { animation: slide-up 0.4s ease-out both; }
.animate-pulse-soft { animation: pulse-soft 2s ease-in-out infinite; }
.animate-fade-in { animation: fade-in 0.3s ease-out both; }

body {
  background-color: #f9fafb;
  color: #111827;
  min-height: 100vh;
}
@media (prefers-color-scheme: dark) {
  body {
    background-color: #030712;
    color: #f3f4f6;
  }
}
""")

# 2. useTTS.ts
rewrite_file(r"hooks/useTTS.ts", """'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export function useTTS() {
  const [isEnabled, setEnabled] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null);
  const [rate, setRate] = useState(1);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const queue = useRef<string[]>([]);
  const isSpeaking = useRef(false);

  useEffect(() => {
    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      if (!selectedVoice && voices.length > 0) {
        setSelectedVoice(voices[0]);
      }
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }, [selectedVoice]);

  const processQueue = useCallback(() => {
    if (!isEnabled || isSpeaking.current || queue.current.length === 0) return;
    isSpeaking.current = true;
    const text = queue.current.shift()!;
    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = rate;
    utterance.onend = () => {
      isSpeaking.current = false;
      processQueue();
    };
    window.speechSynthesis.speak(utterance);
  }, [isEnabled, selectedVoice, rate]);

  const speak = useCallback((text: string) => {
    if (!isEnabled) return;
    queue.current.push(text);
    processQueue();
  }, [isEnabled, processQueue]);

  const announceCourtAssignment = useCallback((courtLabel: string, teamA: string[], teamB: string[]) => {
    speak(`${courtLabel}: ${teamA.join(' and ')} versus ${teamB.join(' and ')}. Please head to ${courtLabel}.`);
  }, [speak]);

  const announceCourtOpen = useCallback((courtLabel: string) => {
    speak(`${courtLabel} is now open.`);
  }, [speak]);

  return {
    speak,
    isEnabled,
    setEnabled,
    selectedVoice,
    setSelectedVoice,
    rate,
    setRate,
    availableVoices,
    announceCourtAssignment,
    announceCourtOpen
  };
}
""")
