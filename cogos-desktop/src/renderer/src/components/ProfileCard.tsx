import React, { useState, useEffect } from 'react'
import { Target, RefreshCw, Zap, Brain, User, Shield, PenTool, Moon, Sun } from 'lucide-react'
import type { UserProfile } from '../types'
import { ACTIVITY_COLORS } from '../types'

interface Props { 
  profile: UserProfile | null
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

const STYLE_CONFIG: Record<string, { label: string; icon: any; badge: string }> = {
  'deep-focus': { label: 'Deep Focus', icon: Target, badge: 'badge--purple' },
  'multitasker': { label: 'Multitasker', icon: RefreshCw, badge: 'badge--blue' },
  'sprinter': { label: 'Sprinter', icon: Zap, badge: 'badge--amber' },
  'unknown': { label: 'Learning...', icon: Brain, badge: 'badge--purple' },
}

export default function ProfileCard({ profile, theme, onToggleTheme }: Props) {
  if (!profile) return <div className="empty-state"><div className="empty-state__icon"><User size={32} /></div><div className="empty-state__text">No profile data yet.</div></div>

  const style = STYLE_CONFIG[profile.preferred_work_style] || STYLE_CONFIG.unknown
  const dist = Object.entries(profile.activity_distribution).sort((a, b) => b[1] - a[1])
  const maxPct = Math.max(...dist.map(([, v]) => v), 1)

  const [intervalSecs, setIntervalSecs] = useState<number>(30)
  const [saving, setSaving] = useState(false)

  // New states for privacy and personalization
  const [privacyMode, setPrivacyMode] = useState<string>('allow_all')
  const [allowlistText, setAllowlistText] = useState<string>('')
  const [customInstructions, setCustomInstructions] = useState<string>('')
  const [savingPrivacy, setSavingPrivacy] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)

  useEffect(() => {
    window.cognition.getCoachInterval().then(res => {
      if (res && res.interval) setIntervalSecs(res.interval)
    }).catch(() => {})

    window.cognition.getPrivacySettings().then((res: any) => {
      if (res) {
        setPrivacyMode(res.privacy_mode)
        setAllowlistText((res.window_allowlist || []).join(', '))
      }
    }).catch(() => {})

    if (profile && (profile as any).custom_instructions !== undefined) {
      setCustomInstructions((profile as any).custom_instructions)
    }
  }, [profile])

  const handleIntervalChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = Number(e.target.value)
    setIntervalSecs(val)
    setSaving(true)
    try {
      await window.cognition.setCoachInterval(val)
    } finally {
      setTimeout(() => setSaving(false), 500)
    }
  }

  const handleSavePrivacy = async () => {
    setSavingPrivacy(true)
    try {
      const arr = allowlistText.split(',').map(s => s.trim()).filter(Boolean)
      await window.cognition.setPrivacySettings({ privacy_mode: privacyMode, window_allowlist: arr })
    } finally {
      setTimeout(() => setSavingPrivacy(false), 800)
    }
  }

  const handleSaveInstructions = async () => {
    setSavingProfile(true)
    try {
      await window.cognition.setCustomInstructions(customInstructions)
    } finally {
      setTimeout(() => setSavingProfile(false), 800)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div className="section-header" style={{ margin: 0 }}>Behavioral Profile</div>
        <span className={`badge ${style.badge}`} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <style.icon size={12} /> {style.label}
        </span>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card__value" style={{ color: 'var(--accent)' }}>
            {profile.avg_focus_minutes || '—'}
          </div>
          <div className="stat-card__label">avg focus (min)</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value" style={{ color: 'var(--accent-blue)', textTransform: 'capitalize' }}>
            {profile.peak_hours === 'unknown' ? '—' : profile.peak_hours}
          </div>
          <div className="stat-card__label">peak hours</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value" style={{ color: 'var(--accent-emerald)' }}>
            {profile.total_sessions}
          </div>
          <div className="stat-card__label">sessions</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value" style={{ color: 'var(--accent-pink)', textTransform: 'capitalize' }}>
            {profile.dominant_activity === 'unknown' ? '—' : profile.dominant_activity}
          </div>
          <div className="stat-card__label">dominant</div>
        </div>
      </div>

      {dist.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div className="section-header">Activity Distribution</div>
          {dist.map(([activity, pct]) => (
            <div key={activity} className="dist-bar">
              <div className="dist-bar__label">{activity}</div>
              <div className="dist-bar__track">
                <div className="dist-bar__fill" style={{
                  width: `${(pct / maxPct) * 100}%`,
                  background: `linear-gradient(90deg, ${ACTIVITY_COLORS[activity] || '#8b5cf6'}, ${ACTIVITY_COLORS[activity] || '#8b5cf6'}88)`,
                }} />
              </div>
              <div className="dist-bar__pct">{pct}%</div>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="section-header">Preferences & Personalization</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          
          <div className="settings-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--surface-raised)', borderRadius: '12px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Coaching Frequency</div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>How often proactive insights appear</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {saving && <span style={{ fontSize: '11px', color: 'var(--accent)' }}>Saving...</span>}
              <select 
                value={intervalSecs} 
                onChange={handleIntervalChange}
                style={{
                  background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)',
                  padding: '4px 8px', borderRadius: '6px', fontSize: '12px', outline: 'none', cursor: 'pointer'
                }}
              >
                <option value={15}>Every 15 seconds</option>
                <option value={30}>Every 30 seconds</option>
                <option value={60}>Every 1 minute</option>
                <option value={300}>Every 5 minutes</option>
              </select>
            </div>
          </div>

          <div className="settings-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--surface-raised)', borderRadius: '12px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                {theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />} Theme
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Toggle between light and dark mode.</div>
            </div>
            <button 
              onClick={onToggleTheme}
              style={{
                background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)',
                padding: '4px 8px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
              }}
            >
              {theme === 'dark' ? 'Switch to Light' : 'Switch to Dark'}
            </button>
          </div>

          <div className="settings-row" style={{ padding: '12px', background: 'var(--surface-raised)', borderRadius: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Shield size={14} /> Privacy Mode
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Control what apps Synapta observes</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {savingPrivacy && <span style={{ fontSize: '11px', color: 'var(--accent)' }}>Saved!</span>}
                <select 
                  value={privacyMode} 
                  onChange={(e) => setPrivacyMode(e.target.value)}
                  style={{
                    background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-primary)',
                    padding: '4px 8px', borderRadius: '6px', fontSize: '12px', outline: 'none', cursor: 'pointer'
                  }}
                >
                  <option value="allow_all">Observe All Apps</option>
                  <option value="allowlist">Use Allowlist</option>
                </select>
              </div>
            </div>
            {privacyMode === 'allowlist' && (
              <div style={{ marginTop: '8px' }}>
                <input
                  type="text"
                  placeholder="e.g. Code, Browser, Figma (comma separated)"
                  value={allowlistText}
                  onChange={(e) => setAllowlistText(e.target.value)}
                  onBlur={handleSavePrivacy}
                  style={{
                    width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
                    color: 'var(--text-primary)', padding: '8px', borderRadius: '6px', fontSize: '12px', outline: 'none'
                  }}
                />
              </div>
            )}
            {privacyMode === 'allow_all' && (
               <div style={{ marginTop: '8px', textAlign: 'right' }}>
                 <button onClick={handleSavePrivacy} style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>Save Privacy Settings</button>
               </div>
            )}
          </div>

          <div className="settings-row" style={{ padding: '12px', background: 'var(--surface-raised)', borderRadius: '12px' }}>
            <div style={{ marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <PenTool size={14} /> Personalize Synapta
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>How should the AI act? Custom instructions.</div>
              </div>
              {savingProfile && <span style={{ fontSize: '11px', color: 'var(--accent)' }}>Saved!</span>}
            </div>
            <textarea
              placeholder="e.g. Always be direct. Address me as Captain. Focus mainly on my coding practices."
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              onBlur={handleSaveInstructions}
              rows={3}
              style={{
                width: '100%', background: 'var(--surface)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', padding: '8px', borderRadius: '6px', fontSize: '12px', outline: 'none',
                resize: 'vertical'
              }}
            />
          </div>

        </div>
      </div>
    </div>
  )
}

