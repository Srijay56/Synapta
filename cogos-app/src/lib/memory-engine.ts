// ============================================
// CognitionOS — Memory Engine
// Distills raw events into meaningful memories
// ============================================

import type { CogEvent, Memory, MoodType, ActivityType } from '@/types';

// Tag generation rules based on activity + description keywords
const TAG_RULES: Record<string, string[]> = {
  // Activity-based tags
  coding: ['development', 'engineering'],
  browsing: ['research', 'learning'],
  designing: ['design', 'creative'],
  writing: ['documentation', 'communication'],
  meeting: ['collaboration', 'team'],
  break: ['wellness', 'recovery'],
};

const KEYWORD_TAGS: Record<string, string> = {
  auth: 'authentication',
  login: 'authentication',
  jwt: 'security',
  oauth: 'security',
  api: 'backend',
  rest: 'backend',
  database: 'data',
  sql: 'data',
  supabase: 'data',
  react: 'frontend',
  component: 'frontend',
  css: 'styling',
  tailwind: 'styling',
  figma: 'prototyping',
  wireframe: 'prototyping',
  test: 'testing',
  debug: 'debugging',
  bug: 'debugging',
  deploy: 'devops',
  docker: 'devops',
  docs: 'documentation',
  readme: 'documentation',
  sprint: 'agile',
  standup: 'agile',
  review: 'quality',
  refactor: 'quality',
  performance: 'optimization',
  websocket: 'realtime',
};

// Summary templates per activity
const SUMMARY_TEMPLATES: Record<ActivityType, string[]> = {
  coding: [
    'Focused coding session: {desc}',
    'Deep work on code: {desc}',
    'Engineering sprint: {desc}',
  ],
  browsing: [
    'Research session: {desc}',
    'Knowledge gathering: {desc}',
    'Exploring resources: {desc}',
  ],
  designing: [
    'Creative design session: {desc}',
    'Visual iteration: {desc}',
    'Design exploration: {desc}',
  ],
  writing: [
    'Writing session: {desc}',
    'Documentation work: {desc}',
    'Content creation: {desc}',
  ],
  meeting: [
    'Team interaction: {desc}',
    'Collaborative session: {desc}',
    'Sync meeting: {desc}',
  ],
  break: [
    'Recovery break: {desc}',
    'Pause for recharge: {desc}',
    'Mindful break: {desc}',
  ],
};

// Mood inference based on activity patterns
function inferMood(activity: ActivityType, durationMinutes: number): MoodType {
  if (activity === 'break') return 'tired';
  if (activity === 'designing') return 'creative';
  if (activity === 'coding' && durationMinutes >= 30) return 'focused';
  if (activity === 'coding' && durationMinutes < 10) return 'scattered';
  if (activity === 'meeting') return 'neutral';
  if (durationMinutes >= 25) return 'focused';
  return 'neutral';
}

// Extract keyword-based tags from description
function extractTags(activity: ActivityType, description: string): string[] {
  const tags = new Set<string>([activity, ...(TAG_RULES[activity] || [])]);

  const lowerDesc = description.toLowerCase();
  for (const [keyword, tag] of Object.entries(KEYWORD_TAGS)) {
    if (lowerDesc.includes(keyword)) {
      tags.add(tag);
    }
  }

  return Array.from(tags).slice(0, 6); // Cap at 6 tags
}

// Generate a human-readable summary
function generateSummary(activity: ActivityType, description: string): string {
  const templates = SUMMARY_TEMPLATES[activity];
  const template = templates[Math.floor(Math.random() * templates.length)];
  // Clean up description for summary
  const cleanDesc = description.replace(/^(Working on |Implementing |Debugging |Refactoring |Writing |Reading |Reviewing |Checking |Browsing |Exploring |Creating |Designing |Drafting |Updating |Documenting )/i, '');
  return template.replace('{desc}', cleanDesc.charAt(0).toLowerCase() + cleanDesc.slice(1));
}

/**
 * Distill a raw event into a meaningful memory
 */
export function distillMemory(event: CogEvent): Omit<Memory, 'id' | 'created_at'> {
  return {
    activity: event.activity,
    summary: generateSummary(event.activity, event.description),
    tags: extractTags(event.activity, event.description),
    mood: inferMood(event.activity, event.duration_minutes),
    source_event_id: event.id,
  };
}
