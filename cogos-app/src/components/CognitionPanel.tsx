'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { Memory, UserProfile } from '@/types';

interface CognitionPanelProps {
  memories: Memory[];
  profile: UserProfile | null;
}

export default function CognitionPanel({ memories, profile }: CognitionPanelProps) {
  const [isActivating, setIsActivating] = useState(false);
  const [response, setResponse] = useState<string | null>(null);
  const [displayedText, setDisplayedText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [showContext, setShowContext] = useState(false);
  const typewriterRef = useRef<NodeJS.Timeout | null>(null);

  // Typewriter effect
  useEffect(() => {
    if (!response) return;

    setIsTyping(true);
    setDisplayedText('');
    let i = 0;

    if (typewriterRef.current) clearInterval(typewriterRef.current);

    typewriterRef.current = setInterval(() => {
      if (i < response.length) {
        setDisplayedText(response.slice(0, i + 1));
        i++;
      } else {
        if (typewriterRef.current) clearInterval(typewriterRef.current);
        setIsTyping(false);
      }
    }, 18); // Fast but visible typewriter speed

    return () => {
      if (typewriterRef.current) clearInterval(typewriterRef.current);
    };
  }, [response]);

  const handleActivate = async () => {
    if (isActivating) return;

    setIsActivating(true);
    setResponse(null);
    setDisplayedText('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `I have ${memories.length} memories. My work style is ${profile?.preferred_work_style || 'unknown'}. Dominant activity: ${profile?.dominant_activity || 'unknown'}. Give me a cognitive checkpoint.`,
          include_screen: false,
          deep_memory: false,
        }),
      });

      const data = await res.json();

      if (data.response) {
        // Add previous response to history
        if (response) {
          setHistory((prev) => [response, ...prev].slice(0, 5));
        }
        setResponse(data.response);
      }
    } catch (error) {
      console.error('Activation error:', error);
      setResponse('Connection interrupted. Attempting to reconnect to your cognitive layer...');
    } finally {
      setIsActivating(false);
    }
  };

  return (
    <div className="flex flex-col h-full animate-fade-up" style={{ animationDelay: '0.15s' }}>
      {/* Header */}
      <div className="text-center mb-6">
        <h1
          className="text-2xl font-bold tracking-tight"
          style={{
            background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-blue), var(--accent-cyan))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          CognitionOS
        </h1>
        <p className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
          Cognitive continuity layer • {memories.length} memories loaded
        </p>
      </div>

      {/* Activation Button */}
      <div className="flex justify-center mb-6">
        <button
          onClick={handleActivate}
          disabled={isActivating}
          className="relative group cursor-pointer"
        >
          {/* Glow ring */}
          <div
            className="absolute -inset-3 rounded-2xl opacity-60 blur-xl transition-all duration-500"
            style={{
              background: isActivating
                ? 'conic-gradient(from 0deg, var(--accent-purple), var(--accent-blue), var(--accent-cyan), var(--accent-purple))'
                : 'linear-gradient(135deg, var(--accent-purple), var(--accent-blue))',
              animation: isActivating ? 'spin 2s linear infinite' : 'none',
            }}
          />

          {/* Button */}
          <div
            className="relative px-8 py-4 rounded-2xl font-semibold text-sm transition-all duration-300"
            style={{
              background: isActivating
                ? 'linear-gradient(135deg, rgba(139, 92, 246, 0.3), rgba(59, 130, 246, 0.3))'
                : 'linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(59, 130, 246, 0.2))',
              border: '1px solid rgba(139, 92, 246, 0.3)',
              color: 'white',
              transform: isActivating ? 'scale(0.98)' : 'scale(1)',
            }}
          >
            {isActivating ? (
              <span className="flex items-center gap-2.5">
                <div className="spinner" />
                Analyzing cognitive patterns...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                🧠 Activate CognitionOS
              </span>
            )}
          </div>
        </button>
      </div>

      {/* AI Response Area */}
      <div className="flex-1 flex flex-col gap-4">
        {(response || isActivating) && (
          <div className="glass-strong p-5 glow-purple">
            {/* Response header */}
            <div className="flex items-center gap-2 mb-3">
              <div
                className="w-2 h-2 rounded-full"
                style={{
                  background: isTyping ? 'var(--accent-emerald)' : 'var(--accent-purple)',
                  boxShadow: isTyping
                    ? '0 0 8px rgba(16, 185, 129, 0.5)'
                    : '0 0 8px rgba(139, 92, 246, 0.5)',
                }}
              />
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                {isTyping ? 'CognitionOS is speaking...' : 'Cognitive Analysis'}
              </span>
            </div>

            {/* Response text with typewriter */}
            <div
              className="text-sm leading-relaxed"
              style={{
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-body)',
              }}
            >
              {displayedText}
              {isTyping && <span className="typewriter-cursor" />}
            </div>

            {/* Context used (expandable) */}
            {!isTyping && response && (
              <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border-glass)' }}>
                <button
                  onClick={() => setShowContext(!showContext)}
                  className="text-[10px] font-medium cursor-pointer flex items-center gap-1 transition-colors"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <span style={{ transform: showContext ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>
                    ▶
                  </span>
                  Context used: {memories.length} memories, {profile?.total_sessions || 0} sessions analyzed
                </button>

                {showContext && (
                  <div className="mt-2.5 space-y-1.5 animate-fade-in">
                    <div className="text-[10px] font-mono p-2.5 rounded-lg" style={{ background: 'rgba(0,0,0,0.3)', color: 'var(--text-muted)' }}>
                      <div>Work Style: {profile?.preferred_work_style || 'learning'}</div>
                      <div>Avg Focus: {profile?.avg_focus_minutes || 0}min</div>
                      <div>Dominant: {profile?.dominant_activity || 'none'}</div>
                      <div>Peak: {profile?.peak_hours || 'unknown'}</div>
                      <div className="mt-1 pt-1" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        Recent: {memories.slice(0, 5).map(m => m.activity).join(' → ')}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!response && !isActivating && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="text-5xl mb-4 animate-float">🧠</div>
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                Ready to analyze
              </p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Log activities, then activate to see the magic
              </p>
            </div>
          </div>
        )}

        {/* Previous responses */}
        {history.length > 0 && (
          <div className="space-y-2">
            <h4
              className="text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: 'var(--text-muted)' }}
            >
              Previous Insights
            </h4>
            {history.map((h, i) => (
              <div
                key={i}
                className="p-3 rounded-xl text-xs leading-relaxed"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  color: 'var(--text-muted)',
                  opacity: 1 - i * 0.15,
                }}
              >
                {h.length > 150 ? h.slice(0, 150) + '...' : h}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
