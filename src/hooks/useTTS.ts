'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useStore } from '@/lib/store';

export function useTTS() {
  const { ttsEnabled: isEnabled, setTTSEnabled: setEnabled, ttsVoice, setTTSVoice, ttsRate: rate, setTTSRate: setRate } = useStore();
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const queue = useRef<{text: string, force: boolean}[]>([]);
  const isSpeaking = useRef(false);

  const selectedVoice = availableVoices.find(v => v.name === ttsVoice) || availableVoices[0] || null;

  const setSelectedVoice = (voice: SpeechSynthesisVoice | null) => {
    setTTSVoice(voice?.name || null);
  };

  useEffect(() => {
    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      if (!ttsVoice && voices.length > 0) {
        setTTSVoice(voices[0].name);
      }
    };
    updateVoices();
    window.speechSynthesis.onvoiceschanged = updateVoices;
  }, [ttsVoice, setTTSVoice]);

  const processQueueRef = useRef<() => void>(() => {});

  const processQueue = useCallback(() => {
    if (isSpeaking.current || queue.current.length === 0) return;
    
    // Check next item
    const nextItem = queue.current[0];
    if (!isEnabled && !nextItem.force) {
      // If disabled and not forced, just discard the whole queue
      queue.current = [];
      return;
    }

    isSpeaking.current = true;
    const { text } = queue.current.shift()!;
    const utterance = new SpeechSynthesisUtterance(text);
    if (selectedVoice) utterance.voice = selectedVoice;
    utterance.rate = rate;
    utterance.onend = () => {
      isSpeaking.current = false;
      processQueueRef.current();
    };
    window.speechSynthesis.speak(utterance);
  }, [isEnabled, selectedVoice, rate]);

  useEffect(() => {
    processQueueRef.current = processQueue;
  }, [processQueue]);

  const speak = useCallback((text: string, force = false) => {
    if (!isEnabled && !force) return;
    queue.current.push({ text, force });
    processQueueRef.current();
  }, [isEnabled]);

  const announceCourtAssignment = useCallback((courtLabel: string, teamA: string[], teamB: string[], force = false) => {
    const text = `${courtLabel}: ${teamA.join(' and ')} versus ${teamB.join(' and ')}. Please head to ${courtLabel}.`;
    speak(text, force);
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
