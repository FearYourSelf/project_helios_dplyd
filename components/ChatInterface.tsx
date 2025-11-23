
import React, { useEffect, useRef, useState } from 'react';
import { Message, Sender } from '../types';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isTyping: boolean;
  modelIsThinking: boolean;
}

// Helper to clean text of audio tags [tag], (tag), or *action*
const cleanTextForDisplay = (text: string) => {
  return text
    .replace(/\[.*?\]/g, '') // remove [brackets]
    .replace(/\(.*?\)/g, '') // remove (parentheses)
    .replace(/\*.*?\*/g, '') // remove *asterisks* (markdown emphasis/action)
    .trim();
};

// Helper to handle smooth typing effect
const TypewriterMessage: React.FC<{ text: string }> = ({ text }) => {
  const [displayedText, setDisplayedText] = useState('');
  const cleanText = cleanTextForDisplay(text);
  
  useEffect(() => {
    let index = 0;
    // Faster typing for smoother feel
    const interval = setInterval(() => {
      setDisplayedText(cleanText.substring(0, index + 1));
      index++;
      if (index >= cleanText.length) clearInterval(interval);
    }, 15); 
    
    return () => clearInterval(interval);
  }, [cleanText]);

  return <span className="animate-fade-in">{displayedText}</span>;
};

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isTyping, modelIsThinking }) => {
  const [input, setInput] = React.useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
    // Root is full width/height to allow gradient to span full screen
    <div className="flex flex-col h-full w-full z-10 relative">
      
      {/* Messages Area - Constrained to max-w-2xl for readability */}
      {/* Added [mask-image] for top fade effect */}
      <div className="flex-1 w-full max-w-2xl mx-auto overflow-y-auto no-scrollbar space-y-8 px-6 pt-32 pb-48 [mask-image:linear-gradient(to_bottom,transparent_0%,black_15%,black_100%)]">
        {messages.length === 0 && (
          <div className="text-center text-gray-500 mt-32 opacity-40 animate-fade-in select-none">
            <p className="text-xl font-light tracking-wide">"Relaxation is the art of letting go."</p>
          </div>
        )}
        
        {messages.map((msg, index) => {
           const isLast = index === messages.length - 1;
           const displayText = cleanTextForDisplay(msg.text);
           
           // Don't render empty bubbles if cleaning removed everything
           if (!displayText && !isTyping) return null;

           return (
              <div 
                key={msg.id} 
                className={`flex ${msg.sender === Sender.User ? 'justify-end' : 'justify-center text-center'}`}
              >
                <div 
                  className={`max-w-[85%] rounded-2xl px-6 py-4 text-base leading-relaxed font-light tracking-wide shadow-lg transition-all duration-500 ${
                    msg.sender === Sender.User 
                      ? 'bg-white/5 text-white/90 backdrop-blur-md border border-white/5' 
                      : 'bg-black/40 text-gray-200 backdrop-blur-md border border-white/5'
                  }`}
                >
                  {/* Only use Typewriter for the VERY last message if it is from Helios */}
                  {msg.sender === Sender.Helios && isLast ? (
                    <TypewriterMessage text={msg.text} />
                  ) : (
                    displayText
                  )}
                </div>
              </div>
           );
        })}
        
        {isTyping && (
          <div className="flex justify-center animate-pulse">
            <div className="text-indigo-300/50 text-sm flex items-center gap-2 tracking-widest uppercase text-[10px]">
              {modelIsThinking ? (
                <span>Thinking deeply...</span>
              ) : (
                <span>Helios is typing...</span>
              )}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Gradient Overlay - Reduced height and opacity to stop dimming text */}
      <div className="absolute bottom-0 left-0 w-full h-[40vh] bg-gradient-to-t from-black via-black/50 to-transparent pointer-events-none" />

      {/* Input Area - Constrained Content */}
      <div className="absolute bottom-0 left-0 w-full pb-10 px-6 pointer-events-none">
        <form onSubmit={handleSubmit} className="relative w-full max-w-xl mx-auto pointer-events-auto">
            <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Write to Helios..."
            className="w-full bg-white/5 backdrop-blur-xl rounded-full px-8 py-4 text-white/90 placeholder-white/30 text-center focus:outline-none focus:bg-white/10 transition-all duration-300 border-none ring-0 shadow-none"
            />
        </form>
      </div>
    </div>
  );
};

export default ChatInterface;
