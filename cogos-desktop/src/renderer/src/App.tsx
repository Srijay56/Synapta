import React, { useState, useEffect, useCallback } from 'react'
import TitleBar from './components/TitleBar'
import ChatPanel from './components/ChatPanel'
import MemoryTimeline from './components/MemoryTimeline'
import ProfileCard from './components/ProfileCard'
import ActivityMonitor from './components/ActivityMonitor'
import PatternInsights from './components/PatternInsights'
import NudgeOverlay from './components/NudgeOverlay'
import CoachOverlay from './components/CoachOverlay'
import WellnessPanel from './components/WellnessPanel'
import { buildProfile } from './lib/engine'
import { Brain, Activity, ScrollText, User } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Memory, UserProfile, NudgeEvent } from './types'

type Tab = 'cognition' | 'memories' | 'wellness' | 'profile'

export default function App() {
  const [tab, setTab] = useState<Tab>('cognition')
  const [memories, setMemories] = useState<Memory[]>([])
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLogging, setIsLogging] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [nudge, setNudge] = useState<NudgeEvent | null>(null)
  
  // Theme management
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('cogos-theme') as 'dark' | 'light'
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved)
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('cogos-theme', next)
      document.documentElement.setAttribute('data-theme', next)
      return next
    })
  }, [])

  // Load initial data
  useEffect(() => {
    const load = async () => {
      try {
        const [mems, prof] = await Promise.all([
          window.cognition.getMemories(20),
          window.cognition.getProfile()
        ])
        setMemories(mems || [])
        setProfile(prof || null)
      } catch (err) {
        console.error('Failed to load data:', err)
      } finally {
        setIsLoaded(true)
      }
    }
    load()
  }, [])

  // Listen for real-time nudge events from the observer
  useEffect(() => {
    window.cognition.onNudge((incoming: NudgeEvent) => {
      setNudge(incoming)
    })
  }, [])

  // Log activity
  const handleLogActivity = useCallback(async (activity: string, description: string, duration: number) => {
    setIsLogging(true)
    try {
      const result = await window.cognition.logEvent({ activity, description, duration_minutes: duration })

      if (result.memory) {
        setMemories(prev => [result.memory, ...prev].slice(0, 20))
      }

      // Rebuild profile from all events
      const allEvents = await window.cognition.getAllEvents()
      if (allEvents.length > 0) {
        const newProfile = buildProfile(allEvents)
        const updated = await window.cognition.updateProfile(newProfile)
        setProfile(updated)
      }
    } catch (err) {
      console.error('Failed to log activity:', err)
    } finally {
      setIsLogging(false)
    }
  }, [])

  const handleNudgeDismiss = useCallback(() => {
    setNudge(null)
  }, [])

  if (!isLoaded) {
    return (
      <div className="app-shell">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
              <Brain size={36} />
            </div>
            <div className="spinner" style={{ margin: '0 auto' }} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TitleBar />

      {/* Nudge Overlay — floating above all content (stuck detection) */}
      <NudgeOverlay nudge={nudge} onDismiss={handleNudgeDismiss} />

      {/* Coach Overlay — proactive every-minute coaching + idle popups */}
      <CoachOverlay />

      {/* Tab Navigation */}
      <div className="tab-nav">
        <button className={`tab-btn ${tab === 'cognition' ? 'active' : ''}`} onClick={() => setTab('cognition')}>
          <Brain size={16} /> Cognition
        </button>
        <button className={`tab-btn ${tab === 'wellness' ? 'active' : ''}`} onClick={() => setTab('wellness')}>
          <Activity size={16} /> Wellness
        </button>
        <button className={`tab-btn ${tab === 'memories' ? 'active' : ''}`} onClick={() => setTab('memories')}>
          <ScrollText size={16} /> Memories
        </button>
        <button className={`tab-btn ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>
          <User size={16} /> Profile
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <AnimatePresence mode="wait">
          {tab === 'cognition' && (
            <motion.div 
              key="cognition"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
            >
              <div className="panel-content" style={{ flex: 0, overflow: 'visible', paddingBottom: 0 }}>
                <ActivityMonitor onLog={handleLogActivity} isLogging={isLogging} />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '0 12px 12px' }}>
                <ChatPanel memories={memories} profile={profile} />
              </div>
            </motion.div>
          )}

          {tab === 'memories' && (
            <motion.div
              key="memories"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="panel-content"
              style={{ height: '100%' }}
            >
              <MemoryTimeline memories={memories} />
            </motion.div>
          )}

          {tab === 'wellness' && (
            <motion.div
              key="wellness"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="panel-content"
              style={{ height: '100%' }}
            >
              <WellnessPanel />
            </motion.div>
          )}

          {tab === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="panel-content"
              style={{ height: '100%' }}
            >
              <ProfileCard profile={profile} theme={theme} onToggleTheme={toggleTheme} />
              <div style={{ marginTop: 16 }}>
                <PatternInsights profile={profile} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

