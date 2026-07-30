import { useEffect, useState, useRef } from 'react'
import '../App.css'
import ChatBox from '../components/ChatBox.jsx'
import { sendChatMessage, uploadDocument, deleteDocument } from '../services/ragApi.js'

const STORAGE_KEYS = {
  selectedTenantId: 'rag.selectedTenantId',
  messages: 'rag.messages',
  threads: 'rag.threads',
  currentThreadId: 'rag.currentThreadId',
}

const MAX_STORED_MESSAGES = 10

const TENANTS = [
  { id: 'tenant-leave', name: 'NG Leave Policy 2026', icon: '📄' },
  { id: 'tenant-travel', name: 'Travel & Reimbursement Policy 2026', icon: '✈️' },
  { id: 'tenant-appraisal', name: 'NavGurukul — Performance Appraisal Policy 2026', icon: '⭐' },
  { id: 'tenant-improvement', name: 'NavGurukul — Performance Improvement Policy 2026', icon: '🌱' },
  { id: 'tenant-posh', name: 'POSH Policy 2026', icon: '🤝' },
  { id: 'tenant-safeguarding', name: 'Student Safeguarding Policy 2026', icon: '🛡️' },
]

const INITIAL_MESSAGES = [
  {
    id: 'msg-001',
    role: 'assistant',
    content: "Hello! 👋 I'm the Insurance AI Assistant. Ask me anything about policy documents, coverage, claims, or compliance guidelines!",
    sources: [],
  },
]

const createId = (prefix) => `${prefix}-${crypto.randomUUID()}`

const safeJsonParse = (value, fallback) => {
  if (!value) return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

const getStoredTenantId = () => {
  if (typeof window === 'undefined') return TENANTS[0].id
  const storedTenantId = window.localStorage.getItem(STORAGE_KEYS.selectedTenantId)
  return TENANTS.some((tenant) => tenant.id === storedTenantId) ? storedTenantId : TENANTS[0].id
}

const getStoredThreads = () => {
  if (typeof window === 'undefined') return []
  const storedThreads = safeJsonParse(window.localStorage.getItem(STORAGE_KEYS.threads), [])
  if (storedThreads.length === 0) {
    const legacyMessages = safeJsonParse(window.localStorage.getItem(STORAGE_KEYS.messages), INITIAL_MESSAGES)
    if (legacyMessages && legacyMessages.length > 1) {
      return [{
        id: createId('thread'),
        title: legacyMessages[1].content.slice(0, 30) + '...',
        messages: legacyMessages.slice(-MAX_STORED_MESSAGES),
        updatedAt: Date.now()
      }]
    }
    return [{
      id: createId('thread'),
      title: 'New chat',
      messages: INITIAL_MESSAGES,
      updatedAt: Date.now()
    }]
  }
  return storedThreads
}

const getStoredCurrentThreadId = (threads) => {
  if (typeof window === 'undefined') return threads[0]?.id
  const stored = window.localStorage.getItem(STORAGE_KEYS.currentThreadId)
  if (stored && threads.some(t => t.id === stored)) return stored
  return threads[0]?.id
}

function RagPlatform() {
  const [selectedTenantId, setSelectedTenantId] = useState(getStoredTenantId)
  const [threads, setThreads] = useState(() => getStoredThreads())
  const [currentThreadId, setCurrentThreadId] = useState(() => getStoredCurrentThreadId(threads))

  const currentThread = threads.find(t => t.id === currentThreadId) || threads[0]
  const messages = currentThread?.messages || INITIAL_MESSAGES
  const [isThinking, setIsThinking] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isDarkTheme, setIsDarkTheme] = useState(false)
  const [isRecentsExpanded, setIsRecentsExpanded] = useState(false)
  const [openMenuId, setOpenMenuId] = useState(null)
  const editFileInputRef = useRef(null)
  const [editingMessageId, setEditingMessageId] = useState(null)

  const selectedTenant = TENANTS.find((tenant) => tenant.id === selectedTenantId) ?? TENANTS[0]

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.selectedTenantId, selectedTenantId)
  }, [selectedTenantId])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.threads, JSON.stringify(threads))
  }, [threads])

  useEffect(() => {
    if (currentThreadId) {
      window.localStorage.setItem(STORAGE_KEYS.currentThreadId, currentThreadId)
    }
  }, [currentThreadId])

  const updateCurrentThread = (updater) => {
    setThreads(currentThreads => {
      return currentThreads.map(thread => {
        if (thread.id === currentThreadId) {
          const updated = { ...thread, ...updater(thread) }
          
          if (updated.title === 'New chat' && updated.messages.length > 1) {
            const firstUserMsg = updated.messages.find(m => m.role === 'user')
            if (firstUserMsg) {
              updated.title = firstUserMsg.content.slice(0, 30) + (firstUserMsg.content.length > 30 ? '...' : '')
            }
          }
          
          return {
            ...updated,
            updatedAt: Date.now()
          }
        }
        return thread
      }).sort((a, b) => b.updatedAt - a.updatedAt)
    })
  }

  const updateMessages = (messageUpdater) => {
    updateCurrentThread(thread => {
      const newMessages = typeof messageUpdater === 'function' ? messageUpdater(thread.messages) : messageUpdater
      return { messages: newMessages.slice(-MAX_STORED_MESSAGES) }
    })
  }

  const handleNewChat = () => {
    const current = threads.find(t => t.id === currentThreadId)
    if (current && current.messages.length === 1 && current.title === 'New chat') {
      return // Already on a fresh new chat
    }
    
    const newThread = {
      id: createId('thread'),
      title: 'New chat',
      messages: INITIAL_MESSAGES,
      updatedAt: Date.now()
    }
    setThreads(currentList => [newThread, ...currentList])
    setCurrentThreadId(newThread.id)
    setOpenMenuId(null)
  }

  const handleDeleteThread = (threadId, e) => {
    e.stopPropagation()
    setThreads(current => {
      const filtered = current.filter(t => t.id !== threadId)
      if (currentThreadId === threadId) {
         if (filtered.length > 0) {
            setCurrentThreadId(filtered[0].id)
         } else {
            const newThread = {
               id: createId('thread'),
               title: 'New chat',
               messages: INITIAL_MESSAGES,
               updatedAt: Date.now()
            }
            setCurrentThreadId(newThread.id)
            return [newThread]
         }
      }
      return filtered
    })
    setOpenMenuId(null)
  }

  const handleDeleteDocumentClick = async (messageId, documentId) => {
    try {
      await deleteDocument({ tenantId: selectedTenant.id, documentId })
      updateMessages((current) =>
        current.map(msg =>
          msg.id === messageId
            ? { ...msg, content: `🗑️ Deleted document: ${msg.fileName}`, isUploadMessage: false }
            : msg
        )
      )
    } catch (error) {
      console.error(error)
    }
  }

  const handleEditDocumentClick = (messageId, documentId) => {
    setEditingMessageId({ messageId, documentId })
    if (editFileInputRef.current) {
      editFileInputRef.current.click()
    }
  }

  const handleEditFileUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file || !editingMessageId) return

    setIsThinking(true)
    try {
      try {
        await deleteDocument({ tenantId: selectedTenant.id, documentId: editingMessageId.documentId })
      } catch (e) {
        // ignore if not found
      }

      const response = await uploadDocument({ tenantId: selectedTenant.id, file })
      updateMessages((current) =>
        current.map(msg =>
          msg.id === editingMessageId.messageId
            ? {
              ...msg,
              content: `✅ Successfully updated to: ${file.name}. I am now ready to answer questions about it!`,
              documentId: response.document_id,
              fileName: file.name
            }
            : msg
        )
      )
    } catch (error) {
      console.error(error)
    } finally {
      setIsThinking(false)
      setEditingMessageId(null)
      event.target.value = ''
    }
  }

  const handlePrompt = async (query) => {
    const userMessage = { id: createId('msg'), role: 'user', content: query, sources: [] }
    
    updateMessages((current) => [...current, userMessage])
    setIsThinking(true)

    try {
      const response = await sendChatMessage({ tenantId: selectedTenant.id, query })
      updateMessages((current) => [
        ...current,
        {
          id: createId('msg'),
          role: 'assistant',
          content: response.answer,
          sources: response.sources.map((source) => `${source.document_id}`),
        },
      ])
    } catch (error) {
      updateMessages((current) => [
        ...current,
        {
          id: createId('msg'),
          role: 'assistant',
          content: `Backend error: ${error.message}`,
          sources: [],
        },
      ])
    } finally {
      setIsThinking(false)
    }
  }

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsThinking(true)
    try {
      const response = await uploadDocument({ tenantId: selectedTenant.id, file })
      updateMessages((current) => [
        ...current,
        {
          id: createId('msg'),
          role: 'assistant',
          content: `✅ Successfully uploaded and indexed: ${file.name}. I am now ready to answer questions about it!`,
          sources: [],
          isUploadMessage: true,
          documentId: response.document_id,
          fileName: file.name
        },
      ])
    } catch (error) {
      updateMessages((current) => [
        ...current,
        {
          id: createId('msg'),
          role: 'assistant',
          content: `❌ Failed to upload PDF: ${error.message}`,
          sources: [],
        },
      ])
    } finally {
      setIsThinking(false)
    }
    event.target.value = '' // Reset input
  }

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className={`sidebar ${!isSidebarOpen ? 'collapsed' : ''} ${isDarkTheme ? 'dark-theme' : ''}`}>
        <div className="sidebar-header-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div className="sidebar-brand" style={{ marginBottom: 0 }}>
            <div className="brand-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginTop: '4px' }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="rgba(255,255,255,0.8)" />
              </svg>
            </div>
            <h1 className="brand-title">InsureAI</h1>
          </div>

          <button className="sidebar-toggle-btn-inner" onClick={() => setIsSidebarOpen(false)} title="Close sidebar" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#718096', padding: '0.4rem', borderRadius: '6px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="9" y1="3" x2="9" y2="21"></line>
            </svg>
          </button>
        </div>

        <button className="new-chat-btn" onClick={handleNewChat}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
          New chat
        </button>

        <p className="sidebar-subtitle">AI Assistant — Ask anything about policies & claims</p>

        {(() => {
          const validThreads = threads.filter(t => t.title !== 'New chat')
          return (
            <>
              <div 
                className="section-label" 
                style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                onClick={() => setIsRecentsExpanded(!isRecentsExpanded)}
              >
                <span>RECENTS</span>
                <svg 
                  width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: isRecentsExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', color: '#a0aec0' }}
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </div>
              <div className="tenant-list" style={{ marginBottom: '1.5rem' }}>
                {validThreads.slice(0, 2).map((thread) => (
                  <div key={thread.id} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      className={`tenant-item ${thread.id === currentThreadId ? 'active' : ''}`}
                      onClick={() => { setCurrentThreadId(thread.id); setOpenMenuId(null); }}
                      style={{ padding: '0.5rem', fontSize: '0.85rem', paddingRight: '2.5rem' }}
                      title={thread.title}
                    >
                      <span className="tenant-icon" style={{ fontSize: '0.9rem' }}>💬</span>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{thread.title}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === thread.id ? null : thread.id) }}
                      style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: '#a0aec0', padding: '4px', display: 'flex', alignItems: 'center' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="12" cy="5" r="1"></circle>
                        <circle cx="12" cy="19" r="1"></circle>
                      </svg>
                    </button>
                    {openMenuId === thread.id && (
                      <div style={{ position: 'absolute', right: '0.5rem', top: '100%', background: isDarkTheme ? '#334155' : 'white', border: `1px solid ${isDarkTheme ? '#475569' : '#e2e8f0'}`, borderRadius: '6px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 50, overflow: 'hidden' }}>
                        <button
                          onClick={(e) => handleDeleteThread(thread.id, e)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.5rem 1rem', width: '100%', textAlign: 'left', color: '#ef4444', fontSize: '0.85rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {isRecentsExpanded && validThreads.slice(2).map((thread) => (
                  <div key={thread.id} style={{ position: 'relative' }}>
                    <button
                      type="button"
                      className={`tenant-item ${thread.id === currentThreadId ? 'active' : ''}`}
                      onClick={() => { setCurrentThreadId(thread.id); setOpenMenuId(null); }}
                      style={{ padding: '0.5rem', fontSize: '0.85rem', paddingRight: '2.5rem', opacity: 0.85 }}
                      title={thread.title}
                    >
                      <span className="tenant-icon" style={{ fontSize: '0.9rem' }}>💬</span>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{thread.title}</span>
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === thread.id ? null : thread.id) }}
                      style={{ position: 'absolute', right: '0.5rem', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: '#a0aec0', padding: '4px', display: 'flex', alignItems: 'center' }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="12" cy="5" r="1"></circle>
                        <circle cx="12" cy="19" r="1"></circle>
                      </svg>
                    </button>
                    {openMenuId === thread.id && (
                      <div style={{ position: 'absolute', right: '0.5rem', top: '100%', background: isDarkTheme ? '#334155' : 'white', border: `1px solid ${isDarkTheme ? '#475569' : '#e2e8f0'}`, borderRadius: '6px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', zIndex: 50, overflow: 'hidden' }}>
                        <button
                          onClick={(e) => handleDeleteThread(thread.id, e)}
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0.5rem 1rem', width: '100%', textAlign: 'left', color: '#ef4444', fontSize: '0.85rem', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )
        })()}

        <div className="section-label">DATA SOURCES</div>
        <div className="tenant-list">
          {TENANTS.map((tenant) => (
            <button
              key={tenant.id}
              type="button"
              className={`tenant-item ${tenant.id === selectedTenant.id ? 'active' : ''}`}
              onClick={() => setSelectedTenantId(tenant.id)}
            >
              <span className="tenant-icon">{tenant.icon}</span>
              <span>{tenant.name}</span>
            </button>
          ))}
        </div>

        <div className="theme-toggle-wrapper">
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>Dark Theme</span>
          <label className="switch">
            <input type="checkbox" checked={isDarkTheme} onChange={() => setIsDarkTheme(!isDarkTheme)} />
            <span className="slider"></span>
          </label>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className={`chat-header ${isDarkTheme ? 'dark-theme' : ''}`}>
          {!isSidebarOpen && (
            <button className="sidebar-toggle-btn" onClick={() => setIsSidebarOpen(true)} title="Open sidebar">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="9" y1="3" x2="9" y2="21"></line>
              </svg>
            </button>
          )}

          <div className="header-avatar">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="2" />
            </svg>
          </div>
          <div className="header-info">
            <h2>Insurance AI Assistant</h2>
            <div className="status-indicator">
              <div className="status-dot"></div>
              <span>Online</span>
            </div>
          </div>
          <div className="header-actions" style={{ marginLeft: 'auto' }}>
            <label className="upload-pdf-btn" style={{
              cursor: 'pointer',
              background: '#fce4ec',
              color: '#d81b60',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontWeight: '600',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'background 0.2s',
            }}>
              <span style={{ fontSize: '1.2rem' }}>📄</span> Upload PDF
              <input
                type="file"
                accept="application/pdf"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>
          </div>
        </header>

        <ChatBox
          messages={messages}
          onSend={handlePrompt}
          isThinking={isThinking}
          onDeleteDocument={handleDeleteDocumentClick}
          onEditDocument={handleEditDocumentClick}
        />

        <input
          type="file"
          accept="application/pdf"
          onChange={handleEditFileUpload}
          ref={editFileInputRef}
          style={{ display: 'none' }}
        />
      </main>
    </div>
  )
}

export default RagPlatform