import React, { useState, useEffect } from 'react'
import ObserverStatus from './ObserverStatus'
import { Brain } from 'lucide-react'

export default function TitleBar() {
  const [isPinned, setIsPinned] = useState(true)
  const [ollamaOnline, setOllamaOnline] = useState(false)
  const [modelName, setModelName] = useState('Offline')

  useEffect(() => {
    window.cognition.isPinned().then(setIsPinned)
    
    const updateStatus = () => {
      window.cognition.checkOllama().then(s => {
        setOllamaOnline(s.online)
        if (s.online) {
          setModelName(s.model === 'gemma-4-e4b' ? 'Gemma 4' : 'Ollama')
        } else {
          setModelName('Offline')
        }
      })
    }

    updateStatus()
    const interval = setInterval(updateStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="title-bar">
      <div className="title-bar__brand">
        <span className="title-bar__logo" style={{ display: 'flex', alignItems: 'center' }}>
          <Brain size={16} color="var(--text-primary)" strokeWidth={1.5} />
        </span>
        <span className="title-bar__name">Synapta</span>
      </div>

      <div className="title-bar__status">
        <div className={`status-dot ${ollamaOnline ? 'status-dot--online' : 'status-dot--offline'}`} />
        <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          {modelName}
        </span>
        <ObserverStatus />
      </div>

      <div className="title-bar__controls">
        <button
          className="title-bar__btn title-bar__btn--minimize"
          onClick={() => window.cognition.minimize()}
          title="Minimize"
        />
        <button
          className={`title-bar__btn title-bar__btn--pin ${isPinned ? 'pinned' : ''}`}
          onClick={() => { window.cognition.togglePin(); setIsPinned(!isPinned) }}
          title={isPinned ? 'Unpin' : 'Pin on top'}
        />
        <button
          className="title-bar__btn title-bar__btn--close"
          onClick={() => window.cognition.close()}
          title="Close to tray"
        />
      </div>
    </div>
  )
}

