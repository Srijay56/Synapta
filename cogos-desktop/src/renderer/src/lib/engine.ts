import React from 'react'
import type { Memory, UserProfile } from '../types'

interface ProfileEngineInput {
  activity: string
  duration_minutes: number
  created_at?: string
}

export function buildProfile(events: ProfileEngineInput[]): Omit<UserProfile, 'id' | 'updated_at'> {
  const distribution = calcDistribution(events)
  const avgFocus = calcAvgFocus(events)
  const workStyle = inferWorkStyle(events, avgFocus, distribution)

  return {
    preferred_work_style: workStyle,
    avg_focus_minutes: avgFocus,
    dominant_activity: findDominant(distribution),
    total_sessions: events.length,
    peak_hours: inferPeakHours(events),
    activity_distribution: distribution,
    behavioral_notes: generateNotes(events, workStyle, avgFocus, distribution),
  }
}

function calcDistribution(events: ProfileEngineInput[]): Record<string, number> {
  if (!events.length) return {}
  const counts: Record<string, number> = {}
  for (const e of events) counts[e.activity] = (counts[e.activity] || 0) + 1
  const total = events.length
  const dist: Record<string, number> = {}
  for (const [a, c] of Object.entries(counts)) dist[a] = Math.round((c / total) * 100)
  return dist
}

function findDominant(dist: Record<string, number>): any {
  let max = 0, dom: any = 'unknown'
  for (const [a, p] of Object.entries(dist)) { if (p > max) { max = p; dom = a } }
  return dom
}

function calcAvgFocus(events: ProfileEngineInput[]): number {
  const focus = events.filter(e => e.activity !== 'break' && e.activity !== 'meeting')
  if (!focus.length) return 0
  return Math.round(focus.reduce((s, e) => s + (e.duration_minutes || 5), 0) / focus.length)
}

function inferWorkStyle(events: ProfileEngineInput[], avgFocus: number, dist: Record<string, number>): any {
  if (events.length < 3) return 'unknown'
  const unique = new Set(events.map(e => e.activity)).size
  const recent = events.slice(0, 10)
  let switches = 0
  for (let i = 1; i < recent.length; i++) if (recent[i].activity !== recent[i-1].activity) switches++
  const rate = switches / Math.max(recent.length - 1, 1)
  const maxPct = Math.max(...Object.values(dist), 0)
  if (avgFocus >= 25 && rate < 0.5 && maxPct >= 40) return 'deep-focus'
  if (unique >= 4 && rate > 0.7) return 'multitasker'
  if (avgFocus <= 15 && events.length >= 5) return 'sprinter'
  if (avgFocus >= 20) return 'deep-focus'
  return 'sprinter'
}

function inferPeakHours(events: ProfileEngineInput[]): string {
  const now = new Date().getHours()
  if (now >= 5 && now < 12) return 'morning'
  if (now >= 12 && now < 17) return 'afternoon'
  if (now >= 17 && now < 21) return 'evening'
  return 'night'
}

function generateNotes(events: ProfileEngineInput[], ws: any, avg: number, dist: Record<string, number>): string[] {
  const notes: string[] = []
  if (events.length < 2) return ['Not enough data yet']
  for (let i = 1; i < events.length; i++) {
    if (events[i].activity === 'coding' && events[i-1].activity === 'browsing') {
      notes.push('Tends to research before coding sessions'); break
    }
  }
  if (ws === 'deep-focus') notes.push(`Maintains deep focus with avg ${avg}-min sessions`)
  else if (ws === 'multitasker') notes.push('Frequently switches between activity types')
  else if (ws === 'sprinter') notes.push(`Works in quick ${avg}-min bursts`)
  const sorted = Object.entries(dist).sort((a, b) => b[1] - a[1])
  if (sorted.length >= 2) notes.push(`Primary: ${sorted[0][0]} (${sorted[0][1]}%), secondary: ${sorted[1][0]} (${sorted[1][1]}%)`)
  return notes.slice(0, 5)
}

// AI prompt builder
export function buildPrompt(memories: Memory[], profile: UserProfile, currentContext: string): string {
  const memStr = memories.map((m, i) => `${i+1}. ${m.summary} (mood: ${m.mood}, tags: ${m.tags.join(', ')})`).join('\n')
  const distStr = Object.entries(profile.activity_distribution).map(([k,v]) => `${k}: ${v}%`).join(', ')

  return `You are CognitionOS, a cognitive continuity system. You are NOT a chatbot.
You are the user's persistent cognitive co-worker who remembers how they think and work.

RECENT MEMORIES (last ${memories.length} sessions):
${memStr || 'No memories yet.'}

USER BEHAVIORAL PROFILE:
- Work Style: ${profile.preferred_work_style}
- Avg Focus: ${profile.avg_focus_minutes} min
- Dominant Activity: ${profile.dominant_activity}
- Total Sessions: ${profile.total_sessions}
- Peak Hours: ${profile.peak_hours}
- Distribution: ${distStr}
- Notes: ${profile.behavioral_notes.join('; ')}

CURRENT CONTEXT:
${currentContext || 'User activated CognitionOS to check in.'}

INSTRUCTIONS:
1. Reference specific past memories to show continuity
2. Identify patterns the user may not notice
3. Give ONE specific, actionable suggestion
4. Keep it concise (3-5 sentences max)
5. Speak as a thoughtful co-worker, not an assistant
6. Start with a behavior observation
7. Never say "I'm an AI"`
}
