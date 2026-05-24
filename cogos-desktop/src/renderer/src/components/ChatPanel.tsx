import React, { useState, useEffect, useRef } from 'react'
import { Heart, Zap, HelpCircle, Send } from 'lucide-react'
import type { Memory, UserProfile } from '../types'
import { buildPrompt } from '../lib/engine'

interface Props {
  memories: Memory[]
  profile: UserProfile | null
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function ChatPanel({ memories, profile }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [wellnessState, setWellnessState] = useState<any>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Fetch wellness state for context-aware chat
  useEffect(() => {
    const fetchWellness = async () => {
      try {
        const ws = await window.cognition.getWellness()
        setWellnessState(ws)
      } catch { /* ignore */ }
    }
    fetchWellness()
    const interval = setInterval(fetchWellness, 60000) // refresh every minute
    return () => clearInterval(interval)
  }, [])

  // Set up streaming listeners
  useEffect(() => {
    window.cognition.onChatChunk((chunk) => {
      setStreamText(prev => prev + chunk)
    })

    window.cognition.onChatDone(() => {
      setStreamText(prev => {
        if (prev) {
          setMessages(msgs => [...msgs, { role: 'assistant', content: prev }])
        }
        return ''
      })
      setIsStreaming(false)
    })

    window.cognition.onChatError((error) => {
      setStreamText('')
      setMessages(msgs => [...msgs, { role: 'assistant', content: `⚠️ ${error}` }])
      setIsStreaming(false)
    })
  }, [])

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, streamText])

  // Build a rich, context-aware system prompt
  const buildSystemPrompt = (): string => {
    const parts = [
      `You are Synapta, a personal AI companion running entirely on the user's device.`,
      `You are a thoughtful, empathetic assistant who deeply understands the user's work patterns, wellness, and history.`,
      `Be conversational, warm, and concise. Use the context below to give highly personalized responses.`,
    ]

    if (profile) {
      parts.push(`\nUser profile: Work style = ${profile.preferred_work_style || 'unknown'}, Dominant activity = ${profile.dominant_activity || 'unknown'}.`)
    }

    if (memories.length > 0) {
      parts.push(`\nUser has ${memories.length} stored memories/observations. Reference relevant ones when helpful.`)
      // Include the last few memories for immediate context
      const recentMems = memories.slice(-5).map(m => {
        const content = typeof m === 'object' ? (m.content || m.memory || JSON.stringify(m)) : String(m)
        return content.slice(0, 200)
      })
      parts.push(`Recent memories:\n${recentMems.map((m, i) => `  ${i+1}. ${m}`).join('\n')}`)
    }

    if (wellnessState) {
      const mood = wellnessState.mood_label || wellnessState.mood || 'unknown'
      const stress = wellnessState.stress_level != null ? `${(wellnessState.stress_level * 100).toFixed(0)}%` : '?'
      const focus = wellnessState.focus_score != null ? `${(wellnessState.focus_score * 100).toFixed(0)}%` : '?'
      const energy = wellnessState.energy_estimate || '?'
      const session = wellnessState.session_duration_minutes || 0
      parts.push(`\nCurrent wellness: Mood=${mood}, Stress=${stress}, Focus=${focus}, Energy=${energy}, Session=${session.toFixed(0)}min.`)
      
      if (wellnessState.active_signals && wellnessState.active_signals.length > 0) {
        const signals = wellnessState.active_signals.map((s: any) => `${s.emoji || ''} ${s.name || ''}`).join(', ')
        parts.push(`Active signals: ${signals}`)
      }
      parts.push(`Factor the user's wellness state into your responses. If they seem stressed or tired, be supportive.`)
    }

    parts.push(`\nIf the user asks about their health, wellness, productivity, or patterns — give specific, data-backed answers.`)
    parts.push(`If they ask for help with a task, use what you know about their activity and screen context.`)

    return parts.join('\n')
  }

  const handleQuickAction = async (prompt: string, label: string) => {
    if (isStreaming) return
    setIsStreaming(true)
    setStreamText('')
    setMessages(prev => [...prev, { role: 'user', content: label }])

    const ollamaMessages = [
      { role: 'system' as const, content: buildSystemPrompt() },
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: prompt }
    ]

    await window.cognition.chat(ollamaMessages)
  }

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return
    const userMsg = input.trim()
    setInput('')
    setIsStreaming(true)
    setStreamText('')

    setMessages(prev => [...prev, { role: 'user', content: userMsg }])

    const ollamaMessages = [
      { role: 'system' as const, content: buildSystemPrompt() },
      ...messages.map(m => ({ role: m.role, content: m.content })),
      { role: 'user' as const, content: userMsg }
    ]

    await window.cognition.chat(ollamaMessages)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Messages area */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '0 0 8px 0' }}>
        {/* Smart quick actions based on user state */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          <button 
            className="action-btn" 
            onClick={async () => {
              if (isStreaming) return;
              setIsStreaming(true);
              setStreamText('');
              setMessages(prev => [...prev, { role: 'user', content: '📸 Capturing screen...' }]);
              try {
                const result = await window.cognition.captureScreen();
                if (result.error) {
                  setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${result.error}` }]);
                  setIsStreaming(false);
                  return;
                }
                const ollamaMessages = [
                  { role: 'system', content: buildSystemPrompt() + '\nThe user just captured their screen. Analyze what they appear to be working on and provide a brief observation.' },
                  { role: 'user', content: `Screen capture data: ${result.text}\n\nWhat am I working on? Give me a brief cognitive checkpoint.` }
                ];
                await window.cognition.chat(ollamaMessages);
              } catch (e) {
                setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ Error capturing screen: ${e}` }]);
                setIsStreaming(false);
              }
            }}
            disabled={isStreaming}
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            📸 Capture
          </button>
          <button 
            className="action-btn action-btn--primary" 
            onClick={() => handleQuickAction(
              "Based on my current wellness state, activity patterns, and what I've been doing recently — how am I doing? Give me a quick health and productivity check-in with specific suggestions.",
              "🩺 How am I doing?"
            )} 
            disabled={isStreaming}
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Heart size={13} /> Check-in
          </button>
          <button 
            className="action-btn" 
            onClick={() => handleQuickAction(
              "Look at my recent activity and work patterns. What could I be doing more efficiently? Give me specific, actionable tips based on what you know about my workflow.",
              "⚡ Efficiency tips"
            )} 
            disabled={isStreaming}
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <Zap size={13} /> Efficiency
          </button>
          <button 
            className="action-btn" 
            onClick={() => handleQuickAction(
              "I need help with what I'm currently working on. Based on my screen activity and what I've been stuck on, can you walk me through what I should do next?",
              "🆘 Help me"
            )} 
            disabled={isStreaming}
            style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
          >
            <HelpCircle size={13} /> Help
          </button>
        </div>

        {messages.length === 0 && !isStreaming && (
          <div className="empty-state">
            <div className="empty-state__icon" style={{ fontSize: 42 }}>🧠</div>
            <div className="empty-state__text">
              Ask Synapta anything — wellness check-ins,<br/>productivity tips, or help with your tasks.
            </div>
          </div>
        )}

        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`chat-msg chat-msg--${msg.role === 'user' ? 'user' : 'ai'}`}>
              {msg.content}
            </div>
          ))}

          {/* Streaming response */}
          {isStreaming && (
            <div className="chat-msg chat-msg--ai">
              {streamText || <span className="spinner" />}
              {streamText && <span className="cursor-blink" />}
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <div className="chat-input-row">
        <input
          className="chat-input"
          placeholder="Ask Synapta anything..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isStreaming}
        />
        <button className="action-btn" onClick={handleSend} disabled={isStreaming || !input.trim()} style={{ display: 'flex', alignItems: 'center' }}>
          <Send size={14} />
        </button>
      </div>
    </div>
  )
}
