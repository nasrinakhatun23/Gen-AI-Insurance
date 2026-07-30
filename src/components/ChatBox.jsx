import { useState, useRef, useEffect } from 'react'

function ChatBox({ messages, onSend, isThinking, disabled = false, onDeleteDocument, onEditDocument }) {
  const [prompt, setPrompt] = useState('')
  const scrollRef = useRef(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isThinking])

  const handleSubmit = async (event) => {
    event.preventDefault()
    const query = prompt.trim()
    if (!query) return
    setPrompt('')
    await onSend(query)
  }

  return (
    <>
      <div className="chat-scroll-area" ref={scrollRef}>
        {messages.map((message) => (
          <div key={message.id} className={`chat-message-row ${message.role}`}>
            <div className="chat-message-content">
              <div className="message-avatar">
                {message.role === 'user' ? '👦' : '🤖'}
              </div>
              <div className="bubble">
                {message.content.split('\n').map((line, i) => (
                  <p key={i} style={{ minHeight: line.trim() ? 'auto' : '0.5rem', margin: '0.5rem 0' }}>
                    {line}
                  </p>
                ))}
                {message.isUploadMessage && (
                  <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                    <button 
                      onClick={() => onEditDocument(message.id, message.documentId)}
                      style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem', color: '#718096' }}
                    >
                      ✏️ Edit
                    </button>
                    <button 
                      onClick={() => onDeleteDocument(message.id, message.documentId)}
                      style={{ background: 'transparent', border: '1px solid #e2e8f0', borderRadius: '4px', padding: '0.2rem 0.5rem', cursor: 'pointer', fontSize: '0.8rem', color: '#e53e3e' }}
                    >
                      🗑️ Delete
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {isThinking && (
          <div className="chat-message-row assistant">
            <div className="chat-message-content">
              <div className="message-avatar">🤖</div>
              <div className="bubble typing-indicator">Thinking...</div>
            </div>
          </div>
        )}
      </div>

      <div className="chat-input-wrapper">
        <form className="input-container" onSubmit={handleSubmit}>
          <input
            className="chat-input-field"
            type="text"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask anything about policy documents..."
            disabled={disabled}
          />
          <button
            className="send-button"
            type="submit"
            disabled={isThinking || disabled || !prompt.trim()}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </form>
      </div>
    </>
  )
}

export default ChatBox