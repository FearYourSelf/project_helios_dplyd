
import React, { useEffect, useRef, useState } from 'react';
import { Message, Sender } from '../types';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isTyping: boolean;
  modelIsThinking: boolean;
  agentName?: string;
}

const cleanTextForDisplay = (text: string) => {
  return text
    .replace(/\[.*?\]/g, '') 
    .replace(/\(.*?\)/g, '') 
    .replace(/\*.*?\*/g, '') 
    .replace(/\n\s*\n/g, '\n')
    .trim();
};

// Formats text to highlight "Helios:" and "Elara:" lines
const FormattedText: React.FC<{ text: string }> = ({ text }) => {
  const clean = cleanTextForDisplay(text);
  const lines = clean.split('\n');

  return (
    <div className="flex flex-col gap-2">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return null;

        if (trimmed.toLowerCase().startsWith('helios:')) {
           return (
             <p key={i}>
                <span className="text-blue-300 font-semibold tracking-wide text-xs uppercase mr-2 opacity-80">Helios</span>
                {trimmed.substring(7).trim()}
             </p>
           );
        } else if (trimmed.toLowerCase().startsWith('elara:')) {
           return (
             <p key={i}>
                <span className="text-pink-300 font-semibold tracking-wide text-xs uppercase mr-2 opacity-80">Elara</span>
                {trimmed.substring(6).trim()}
             </p>
           );
        }
        
        return <p key={i}>{trimmed}</p>;
      })}
    </div>
  );
};

const TypewriterMessage: React.FC<{ text: string }> = ({ text }) => {
  const [displayedText, setDisplayedText] = useState('');
  const cleanText = cleanTextForDisplay(text);
  
  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      setDisplayedText(cleanText.substring(0, index + 1));
      index++;
      if (index >= cleanText.length) clearInterval(interval);
    }, 15); 
    
    return () => clearInterval(interval);
  }, [cleanText]);

  // Use FormattedText for the typewriter content as well
  return <div className="animate-fade-in"><FormattedText text={displayedText} /></div>;
};

const SUGGESTIONS = [
    "I can't sleep",
    "I'm feeling anxious",
    "Tell me a story",
    "Just sit with me"
];

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isTyping, modelIsThinking, agentName = 'Helios' }) => {
  const [input, setInput] = React.useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-full w-full z-10 relative">
      <style>{`
        @keyframes slideUpFade {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up {
            animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      {/* Messages Area */}
      <div className="flex-1 w-full max-w-2xl mx-auto overflow-y-auto no-scrollbar space-y-4 px-6 pt-40 pb-48 [mask-image:linear-gradient(to_bottom,transparent_0px,transparent_40px,black_160px,black_100%)]">
        
        <div className="flex flex-col items-center gap-6 mt-2 mb-[35vh] animate-fade-in shrink-0">
            <div className="text-center text-gray-400 opacity-50 select-none px-4">
              <p className="text-xl font-light tracking-wide italic">"Silence is where we begin."</p>
            </div>
            
            <div className="flex flex-wrap justify-center gap-3 max-w-lg px-2">
                {SUGGESTIONS.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => onSendMessage(s)}
                      className="bg-white/5 hover:bg-white/10 text-white/60 hover:text-white/90 backdrop-blur-md border border-white/10 rounded-full px-4 py-2 text-[10px] md:text-xs uppercase tracking-widest transition-all duration-500 hover:scale-105 whitespace-nowrap"
                    >
                        {s}
                    </button>
                ))}
            </div>
        </div>
        
        {messages.map((msg, index) => {
           const isLast = index === messages.length - 1;
           const displayText = cleanTextForDisplay(msg.text);
           
           if (!displayText && !isTyping) return null;

           // SMART ALIGNMENT: 
           // If the message contains Duo labels ("Helios:" or "Elara:"), FORCE left alignment regardless of sender state.
           // This handles the "hangover" bug gracefully in the UI.
           const hasDuoLabels = msg.text.toLowerCase().includes('helios:') || msg.text.toLowerCase().includes('elara:');
           const isDuo = msg.sender === Sender.Duo || hasDuoLabels;
           
           const alignmentClass = msg.sender === Sender.User ? 'justify-end' : 'justify-center';
           const textAlignment = msg.sender === Sender.User ? 'text-left' : (isDuo ? 'text-left' : 'text-center');

           return (
              <div 
                key={msg.id} 
                className={`flex ${alignmentClass} animate-slide-up`}
              >
                <div 
                  className={`max-w-[85%] rounded-2xl px-6 py-4 text-base leading-relaxed font-light tracking-wide shadow-2xl transition-all duration-500 ${textAlignment} ${
                    msg.sender === Sender.User 
                      ? 'bg-white/5 text-white/90 backdrop-blur-md border border-white/5' 
                      : 'bg-black/60 text-gray-200 backdrop-blur-md border border-white/5'
                  }`}
                >
                  {msg.sender !== Sender.User && isLast && !isDuo ? (
                     // Only use typewriter for purely single persona messages
                    <TypewriterMessage text={msg.text} />
                  ) : (
                    <FormattedText text={msg.text} />
                  )}
                </div>
              </div>
           );
        })}
        
        {isTyping && (
          <div className="flex justify-center animate-pulse py-2">
             <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-indigo-400/50 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
                <div className="w-1.5 h-1.5 bg-indigo-400/50 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
                <div className="w-1.5 h-1.5 bg-indigo-400/50 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
             </div>
          </div>
        )}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      <div className="absolute bottom-0 left-0 w-full h-[40vh] bg-gradient-to-t from-black via-black/50 to-transparent pointer-events-none" />

      {/* Input Area */}
      <div className="absolute bottom-0 left-0 w-full pb-10 px-6 pointer-events-none">
        <form onSubmit={handleSubmit} className="relative w-full max-w-xl mx-auto pointer-events-auto">
            <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={`Talk to ${agentName}...`}
            className="w-full bg-white/5 backdrop-blur-2xl rounded-full px-8 py-5 text-white/90 placeholder-white/20 text-center focus:outline-none focus:bg-white/10 transition-all duration-500 border border-white/5 hover:border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] focus:shadow-[0_0_20px_rgba(255,255,255,0.1)]"
            />
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;
