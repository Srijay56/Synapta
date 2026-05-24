// ============================================
// CognitionOS — AI Layer
// Mock + real AI provider wrapper
// ============================================

import type { Memory, UserProfile } from '@/types';

/**
 * Format memories for AI context injection
 */
function formatMemories(memories: Memory[]): string {
  if (memories.length === 0) return 'No memories recorded yet.';

  return memories
    .map((m, i) => {
      const timeAgo = m.created_at
        ? getRelativeTime(new Date(m.created_at))
        : 'recently';
      return `${i + 1}. [${timeAgo}] ${m.summary} (mood: ${m.mood}, tags: ${m.tags.join(', ')})`;
    })
    .join('\n');
}

/**
 * Format profile for AI context injection
 */
function formatProfile(profile: UserProfile): string {
  const dist = Object.entries(profile.activity_distribution)
    .map(([k, v]) => `${k}: ${v}%`)
    .join(', ');

  return `- Work Style: ${profile.preferred_work_style}
- Average Focus Duration: ${profile.avg_focus_minutes} minutes
- Dominant Activity: ${profile.dominant_activity}
- Total Sessions: ${profile.total_sessions}
- Peak Productivity Hours: ${profile.peak_hours}
- Activity Distribution: ${dist}
- Behavioral Notes: ${profile.behavioral_notes.join('; ')}`;
}

/**
 * Build the full AI prompt
 */
export function buildPrompt(memories: Memory[], profile: UserProfile, currentContext: string): string {
  return `You are CognitionOS, a cognitive continuity system. You are NOT a chatbot.
You are the user's persistent cognitive co-worker who remembers how they think and work.

RECENT MEMORIES (last ${memories.length} sessions):
${formatMemories(memories)}

USER BEHAVIORAL PROFILE:
${formatProfile(profile)}

CURRENT CONTEXT:
${currentContext || 'User has just activated CognitionOS to check in.'}

INSTRUCTIONS:
1. Reference specific past memories to show continuity — mention specific activities by name
2. Identify patterns the user may not notice about themselves
3. Give ONE specific, actionable suggestion based on their behavioral profile
4. Keep it concise (3-5 sentences max)
5. Speak as a thoughtful co-worker, not an assistant — be direct and insightful
6. Start with a specific observation about their recent behavior pattern
7. If they seem tired or scattered, gently suggest a break or refocus strategy
8. Never say "I'm an AI" or "As an AI" — you ARE their cognitive continuity layer`;
}

/**
 * Generate a mock AI response that references actual data
 * This creates a convincing demo without needing an API key
 */
function generateMockResponse(memories: Memory[], profile: UserProfile): string {
  if (memories.length === 0) {
    return "I'm just starting to learn how you work. Log a few activities and I'll begin building your cognitive profile. Once I have some data, I can offer insights about your work patterns and help you maintain momentum.";
  }

  const recentActivity = memories[0];
  const workStyle = profile.preferred_work_style;
  const dominant = profile.dominant_activity;
  const avgFocus = profile.avg_focus_minutes;

  // Count activity types in recent memories
  const activityCounts: Record<string, number> = {};
  memories.forEach((m) => {
    activityCounts[m.activity] = (activityCounts[m.activity] || 0) + 1;
  });

  const sortedActivities = Object.entries(activityCounts).sort((a, b) => b[1] - a[1]);

  // Build contextual response
  const parts: string[] = [];

  // Opening observation
  if (sortedActivities.length > 0) {
    const topActivity = sortedActivities[0];
    if (topActivity[1] >= 3) {
      parts.push(
        `I see you've been heavily focused on ${topActivity[0]} today — ${topActivity[1]} out of your last ${memories.length} sessions.`
      );
    } else {
      parts.push(
        `You've been switching between ${sortedActivities.map((a) => a[0]).slice(0, 3).join(', ')} — a fairly ${sortedActivities.length >= 3 ? 'varied' : 'focused'} session.`
      );
    }
  }

  // Reference specific memory
  if (memories.length >= 2) {
    const specificMemory = memories[Math.min(1, memories.length - 1)];
    parts.push(
      `Earlier, your "${specificMemory.summary.toLowerCase()}" session suggests you were in a ${specificMemory.mood} state.`
    );
  }

  // Pattern insight
  if (workStyle === 'deep-focus') {
    parts.push(
      `Your ${avgFocus}-minute average focus duration tells me you're a deep worker — that's a strength. Protect those focus blocks.`
    );
  } else if (workStyle === 'multitasker') {
    parts.push(
      `You're context-switching frequently. Consider batching similar tasks together — your ${dominant} sessions are most productive when uninterrupted.`
    );
  } else if (workStyle === 'sprinter') {
    parts.push(
      `You work in quick ${avgFocus}-minute sprints. That's effective for momentum, but make sure you're not leaving threads half-finished.`
    );
  }

  // Actionable suggestion
  const recentMood = recentActivity.mood;
  if (recentMood === 'tired' || recentMood === 'scattered') {
    parts.push(
      `Your recent ${recentMood} mood suggests it might be time to step back and recharge before your next ${dominant} session.`
    );
  } else if (memories.filter((m) => m.activity === 'coding').length >= 4 && memories.filter((m) => m.activity === 'break').length === 0) {
    parts.push(
      `You've had ${memories.filter((m) => m.activity === 'coding').length} coding sessions without a break — consider a 10-minute walk to reset before your next push.`
    );
  } else {
    parts.push(
      `Based on your ${profile.peak_hours} productivity peak, now is ${profile.peak_hours === inferCurrentPeriod() ? 'prime time for deep work' : 'a good time to handle lighter tasks and save deep focus for your ' + profile.peak_hours + ' peak'}.`
    );
  }

  return parts.join(' ');
}

function inferCurrentPeriod(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return `${Math.floor(diffHrs / 24)}d ago`;
}

/**
 * Generate a CognitionOS response
 * Uses Gemma 4 E4B by default, falls back to mock if no API key
 */
export async function generateCognitionResponse(
  memories: Memory[],
  profile: UserProfile,
  currentContext: string
): Promise<string> {
  const provider = process.env.AI_PROVIDER || 'gemma';
  const apiKey = process.env.GEMINI_API_KEY;

  // Use mock if explicitly set or no API key available
  if (provider === 'mock' || (!apiKey && provider === 'gemma')) {
    return generateMockResponse(memories, profile);
  }

  // Gemma 4 E4B via Google GenAI SDK
  const prompt = buildPrompt(memories, profile, currentContext);

  try {
    const { GoogleGenAI } = await import('@google/genai');

    const ai = new GoogleGenAI({ apiKey });

    const response = await ai.models.generateContent({
      model: 'gemma-4-e4b',
      contents: prompt,
      config: {
        maxOutputTokens: 300,
        temperature: 0.7,
      },
    });

    return response.text || generateMockResponse(memories, profile);
  } catch (error) {
    console.error('Gemma 4 E4B error:', error);
    // Graceful fallback to mock on any API error
    return generateMockResponse(memories, profile);
  }
}

