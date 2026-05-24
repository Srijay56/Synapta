// ============================================
// CogOS Desktop — Preload Bridge
// Exposes safe IPC API to renderer via contextBridge
// All calls proxy to the Python backend through main process
// ============================================

import { contextBridge, ipcRenderer } from 'electron'

export interface CognitionAPI {
  // Activity & Memory (proxied to Python backend)
  logEvent: (event: { activity: string; description: string; duration_minutes: number }) => Promise<any>
  getMemories: (limit?: number) => Promise<any[]>
  getProfile: () => Promise<any>
  updateProfile: (profile: any) => Promise<any>
  getAllEvents: () => Promise<any[]>

  // AI Chat (proxied to Python backend /chat via Ollama)
  chat: (messages: Array<{ role: string; content: string }>) => Promise<boolean>
  onChatChunk: (callback: (chunk: string) => void) => void
  onChatDone: (callback: () => void) => void
  onChatError: (callback: (error: string) => void) => void
  checkOllama: () => Promise<{ online: boolean; model: string }>

  // Screen capture (proxied to Python backend)
  captureScreen: () => Promise<{ text: string; error?: string }>

  // CogOS-specific
  getRecommendations: () => Promise<any[]>
  getInsights: () => Promise<any>
  getRecentFiles: (limit?: number) => Promise<any[]>

  // Autonomous Observer (always-on friend)
  getObserverStatus: () => Promise<any>
  setObserverPaused: (paused: boolean) => Promise<any>
  getObserverContext: (limit?: number) => Promise<any[]>
  getObserverStuck: () => Promise<any>
  dismissNudge: () => Promise<any>
  acceptNudge: () => Promise<{ ok: boolean; context: string }>
  getHelp: () => Promise<{ ok: boolean; suggestions: string; stuck_window?: string; stuck_duration_minutes?: number; error?: string }>
  onNudge: (callback: (nudge: any) => void) => void
  onObserverUpdate: (callback: (update: any) => void) => void

  // Proactive coaching (every 60s + idle detection)
  coachTrigger: () => Promise<{ ok: boolean; message?: string }>
  coachLatest: () => Promise<{ ok: boolean; insight?: string; timestamp?: number; is_idle?: boolean }>
  onCoachInsight: (callback: (insight: any) => void) => void
  onIdle: (callback: (state: any) => void) => void
  onActive: (callback: (state: any) => void) => void
  getCoachInterval: () => Promise<{ interval: number }>
  setCoachInterval: (interval: number) => Promise<{ ok: boolean; interval: number }>

  // Wellness Engine (behavioral pattern recognition)
  getWellness: () => Promise<any>
  getWellnessHistory: (limit?: number) => Promise<any[]>
  onWellnessUpdate: (callback: (state: any) => void) => void

  // Window controls
  minimize: () => void
  togglePin: () => void
  close: () => void
  isPinned: () => Promise<boolean>

  // Privacy & Profile
  getPrivacySettings: () => Promise<any>
  setPrivacySettings: (settings: any) => Promise<any>
  setCustomInstructions: (instructions: string) => Promise<any>
}

const api: CognitionAPI = {
  // Activity & Memory
  logEvent: (event) => ipcRenderer.invoke('db:logEvent', event),
  getMemories: (limit = 20) => ipcRenderer.invoke('db:getMemories', limit),
  getProfile: () => ipcRenderer.invoke('db:getProfile'),
  updateProfile: (profile) => ipcRenderer.invoke('db:updateProfile', profile),
  getAllEvents: () => ipcRenderer.invoke('db:getAllEvents'),

  // AI Chat — streaming
  chat: (messages) => ipcRenderer.invoke('ollama:chat', messages),
  onChatChunk: (callback) => {
    ipcRenderer.removeAllListeners('ollama:chunk')
    ipcRenderer.on('ollama:chunk', (_, chunk) => callback(chunk))
  },
  onChatDone: (callback) => {
    ipcRenderer.removeAllListeners('ollama:done')
    ipcRenderer.on('ollama:done', () => callback())
  },
  onChatError: (callback) => {
    ipcRenderer.removeAllListeners('ollama:error')
    ipcRenderer.on('ollama:error', (_, error) => callback(error))
  },
  checkOllama: () => ipcRenderer.invoke('ollama:status'),

  // Screen capture
  captureScreen: () => ipcRenderer.invoke('screen:capture'),

  // CogOS
  getRecommendations: () => ipcRenderer.invoke('cogos:recommendations'),
  getInsights: () => ipcRenderer.invoke('cogos:insights'),
  getRecentFiles: (limit = 10) => ipcRenderer.invoke('cogos:recentFiles', limit),

  // Autonomous Observer
  getObserverStatus: () => ipcRenderer.invoke('cogos:observerStatus'),
  setObserverPaused: (paused) => ipcRenderer.invoke('cogos:observerControl', paused),
  getObserverContext: (limit = 5) => ipcRenderer.invoke('cogos:observerContext', limit),
  getObserverStuck: () => ipcRenderer.invoke('cogos:observerStuck'),
  dismissNudge: () => ipcRenderer.invoke('cogos:nudgeDismiss'),
  acceptNudge: () => ipcRenderer.invoke('cogos:nudgeAccept'),
  getHelp: () => ipcRenderer.invoke('cogos:getHelp'),
  onNudge: (callback) => {
    ipcRenderer.removeAllListeners('cogos:nudge')
    ipcRenderer.on('cogos:nudge', (_, nudge) => callback(nudge))
  },
  onObserverUpdate: (callback) => {
    ipcRenderer.removeAllListeners('cogos:observerUpdate')
    ipcRenderer.on('cogos:observerUpdate', (_, update) => callback(update))
  },

  // Proactive coaching
  coachTrigger: () => ipcRenderer.invoke('cogos:coachTrigger'),
  coachLatest: () => ipcRenderer.invoke('cogos:coachLatest'),
  onCoachInsight: (callback) => {
    ipcRenderer.removeAllListeners('cogos:coachInsight')
    ipcRenderer.on('cogos:coachInsight', (_, insight) => callback(insight))
  },
  onIdle: (callback) => {
    ipcRenderer.removeAllListeners('cogos:idle')
    ipcRenderer.on('cogos:idle', (_, state) => callback(state))
  },
  onActive: (callback) => {
    ipcRenderer.removeAllListeners('cogos:active')
    ipcRenderer.on('cogos:active', (_, state) => callback(state))
  },
  getCoachInterval: () => ipcRenderer.invoke('cogos:getCoachInterval'),
  setCoachInterval: (interval) => ipcRenderer.invoke('cogos:setCoachInterval', interval),

  // Wellness Engine
  getWellness: () => ipcRenderer.invoke('cogos:wellness'),
  getWellnessHistory: (limit = 12) => ipcRenderer.invoke('cogos:wellnessHistory', limit),
  onWellnessUpdate: (callback) => {
    ipcRenderer.removeAllListeners('cogos:wellnessUpdate')
    ipcRenderer.on('cogos:wellnessUpdate', (_, state) => callback(state))
  },

  // Window controls
  minimize: () => ipcRenderer.send('window:minimize'),
  togglePin: () => ipcRenderer.send('window:togglePin'),
  close: () => ipcRenderer.send('window:close'),
  isPinned: () => ipcRenderer.invoke('window:isPinned'),

  // Privacy & Profile
  getPrivacySettings: () => ipcRenderer.invoke('cogos:getPrivacySettings'),
  setPrivacySettings: (settings) => ipcRenderer.invoke('cogos:setPrivacySettings', settings),
  setCustomInstructions: (instructions) => ipcRenderer.invoke('cogos:setCustomInstructions', instructions)
}

contextBridge.exposeInMainWorld('cognition', api)
