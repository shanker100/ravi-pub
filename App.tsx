import React, { useEffect, useRef } from 'react';
import { useGeminiLive } from './hooks/useGeminiLive';
import { ConnectionState, Message } from './types';
import Visualizer from './components/Visualizer';

// Icons
const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
);

const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>
);

const ConfluenceIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
);

const App: React.FC = () => {
  const { connectionState, connect, disconnect, messages, currentVolume, isVolumeActive } = useGeminiLive();
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const isConnected = connectionState === ConnectionState.CONNECTED;
  const isConnecting = connectionState === ConnectionState.CONNECTING;

  return (
    <div className="flex flex-col h-screen bg-slate-900 text-slate-100 font-sans">
      {/* Header */}
      <header className="p-4 border-b border-slate-700 bg-slate-800/50 flex items-center justify-between backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
             <ConfluenceIcon />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Confluence Assistant</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : isConnecting ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`}></span>
          <span className="text-sm font-medium text-slate-400 capitalize">{connectionState}</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden">
        
        {/* Visualizer Area - Center Stage */}
        <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
          
          {/* Background Ambient Glow */}
          <div className={`absolute inset-0 bg-gradient-to-b from-transparent to-blue-900/20 transition-opacity duration-1000 ${isConnected ? 'opacity-100' : 'opacity-0'}`}></div>
          
          <div className="relative z-10 flex flex-col items-center gap-8">
            <div className={`relative transition-all duration-500 ${isConnected ? 'scale-100' : 'scale-90 opacity-50 grayscale'}`}>
              <div className="w-48 h-48 rounded-full bg-slate-800 border-4 border-slate-700 flex items-center justify-center shadow-2xl relative overflow-hidden">
                 {/* Inner Activity Ring */}
                 {isConnected && (
                   <div 
                      className="absolute inset-0 rounded-full border-4 border-blue-500/50 opacity-50"
                      style={{ transform: `scale(${1 + currentVolume * 0.5})`, transition: 'transform 0.1s ease-out' }}
                   ></div>
                 )}
                 
                 <Visualizer volume={currentVolume} active={isVolumeActive} />
              </div>
            </div>

            <div className="text-center space-y-2">
              <h2 className="text-2xl font-light">
                {isConnected 
                  ? (isVolumeActive ? "Listening..." : "I'm listening") 
                  : "Start a conversation"}
              </h2>
              <p className="text-slate-400 max-w-md">
                Ask about spaces, pages, or summaries in your Confluence knowledge base.
              </p>
            </div>
          </div>
        </div>

        {/* Action Log / Transcripts (System Messages mostly for Tool calls) */}
        {messages.length > 0 && (
          <div className="h-48 border-t border-slate-700 bg-slate-800/80 backdrop-blur p-4 overflow-y-auto" ref={chatContainerRef}>
            <div className="max-w-3xl mx-auto space-y-3">
              {messages.map((msg) => (
                <div key={msg.id} className="flex gap-3 text-sm animate-in fade-in slide-in-from-bottom-2">
                   <div className="mt-0.5 text-slate-400 text-xs uppercase tracking-wider min-w-[60px]">{msg.role}</div>
                   <div className={`${msg.text.startsWith('Error') || msg.text.startsWith('Connection Error') ? 'text-red-400' : 'text-slate-200'}`}>{msg.text}</div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>

      {/* Controls */}
      <div className="p-6 bg-slate-900 border-t border-slate-800 flex justify-center">
         <button
            onClick={isConnected ? disconnect : connect}
            disabled={isConnecting}
            className={`
              relative group flex items-center gap-3 px-8 py-4 rounded-full font-semibold text-lg transition-all duration-300 shadow-lg
              ${isConnected 
                ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/50' 
                : 'bg-blue-600 text-white hover:bg-blue-500 hover:shadow-blue-500/25 hover:-translate-y-0.5'}
              disabled:opacity-50 disabled:cursor-not-allowed
            `}
         >
            {isConnected ? <StopIcon /> : <MicIcon />}
            <span>{isConnected ? 'End Conversation' : isConnecting ? 'Connecting...' : 'Start Talking'}</span>
            
            {/* Button Glow Effect */}
            {!isConnected && !isConnecting && (
              <div className="absolute inset-0 rounded-full ring-2 ring-white/20 animate-pulse-slow"></div>
            )}
         </button>
      </div>
    </div>
  );
};

export default App;