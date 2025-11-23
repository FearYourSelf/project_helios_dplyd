
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Message, Sender, ModelType } from './types';
import { generateTextResponse } from './services/geminiService';
import { streamSpeech } from './services/elevenLabsService';
import { audioEngine } from './services/audioEngine';
import Visualizer, { VisualizerState } from './components/Visualizer';
import ChatInterface from './components/ChatInterface';

declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}

// Voice Constants
const VOICE_HELIOS_ID = 'KmnvDXRA0HU55Q0aqkPG';
// Elara Voice ID
const VOICE_ELARA_ID = 'BpjGufoPiobT79j2vtj4'; 

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [useDeepThinking, setUseDeepThinking] = useState(false);
  const [ambientEnabled, setAmbientEnabled] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [hasStarted, setHasStarted] = useState(false); // Intro state
  
  // Voice Selection State
  const [currentVoiceId, setCurrentVoiceId] = useState(VOICE_HELIOS_ID);
  
  // Voice Mode State
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false); 
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const [userName, setUserName] = useState<string | null>(null);
  const [recognition, setRecognition] = useState<any>(null);
  const [musicVolume, setMusicVolume] = useState(0.5);

  // Refs
  const voiceModeRef = useRef(voiceMode);
  const isProcessingRef = useRef(false);
  const handleSendMessageRef = useRef<any>(null);

  useEffect(() => { voiceModeRef.current = voiceMode; }, [voiceMode]);

  // Audio Ducking Hook
  useEffect(() => {
     audioEngine.duckMusic(isSpeaking);
  }, [isSpeaking]);

  const currentAgentName = currentVoiceId === VOICE_HELIOS_ID ? 'Helios' : 'Elara';

  const getVisualizerState = (): VisualizerState => {
    if (isSpeaking) return 'speaking';
    if (isTyping) return 'thinking'; 
    if (isListening) return 'listening';
    return 'idle';
  };

  const handleStartApp = () => {
      audioEngine.init();
      setHasStarted(true);
      // Optional: Start ambient automatically? 
      // toggleAmbient(); 
      setTimeout(() => {
          const greeting = "[softly] G'day. I'm Helios. Before we drift off, what name should I call you?";
          setMessages([{
              id: 'init-1',
              text: greeting,
              sender: Sender.Helios,
              timestamp: Date.now()
          }]);
      }, 1000);
  };

  const handleSendMessage = useCallback(async (text: string) => {
    const userMsg: Message = {
      id: Date.now().toString(),
      text,
      sender: Sender.User,
      timestamp: Date.now()
    };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    audioEngine.init();

    let nameToUse = userName;
    let finalPrompt = text;
    
    if (!userName) {
        // Detect if user clicked a suggestion chip (Command) instead of giving a name
        const lowerText = text.toLowerCase();
        const isCommand = lowerText.includes("sleep") || lowerText.includes("breathing") || lowerText.includes("story") || lowerText.includes("comfort");

        if (isCommand) {
            setUserName("Friend");
            nameToUse = "Friend";
            finalPrompt = text;
        } else {
            setUserName(text);
            nameToUse = text;
            finalPrompt = `My name is ${text}. Please acknowledge it warmly and ask how you can help me relax today.`;
        }
    }

    const history = messages.filter(m => m.id !== 'init-1').map(m => ({
      role: m.sender === Sender.User ? 'user' : 'model',
      parts: [{ text: m.text }]
    }));

    const modelType = useDeepThinking ? ModelType.Deep : ModelType.Fast;
    // Derive agent name from current voice ID for the persona prompt
    const agentName = currentVoiceId === VOICE_HELIOS_ID ? 'Helios' : 'Elara';

    try {
      const responseText = await generateTextResponse(finalPrompt, modelType, history, nameToUse || undefined, agentName);

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: responseText,
        sender: Sender.Helios,
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, botMsg]);
      setIsTyping(false);

      if (!isMuted) {
          // Pass the current voice ID to the stream function
          const audioBuffer = await streamSpeech(responseText, currentVoiceId);
          if (audioBuffer) {
            setIsSpeaking(true);
            await audioEngine.playSpeech(audioBuffer);
            setIsSpeaking(false);
          }
      }

      // Voice Mode Loop
      isProcessingRef.current = false;
      if (voiceModeRef.current) {
         try { recognition?.start(); setIsListening(true); } catch(e) {}
      }

    } catch (error) {
      console.error("Error in conversation loop", error);
      setIsTyping(false);
      setIsSpeaking(false);
      
      // Fallback message so user sees a thematic response instead of silence
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        text: "I sense a brief drift in the ether. Could you please whisper that to me again?",
        sender: Sender.Helios,
        timestamp: Date.now()
      }]);

      isProcessingRef.current = false;
      if (voiceModeRef.current) {
        try { recognition?.start(); setIsListening(true); } catch(e) {}
      }
    }
  }, [messages, useDeepThinking, isMuted, userName, recognition, currentVoiceId]);

  useEffect(() => {
    handleSendMessageRef.current = handleSendMessage;
  }, [handleSendMessage]);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const recognitionInstance = new window.webkitSpeechRecognition();
      recognitionInstance.continuous = false; 
      recognitionInstance.lang = 'en-US';
      recognitionInstance.interimResults = false;

      recognitionInstance.onstart = () => {
          setIsListening(true);
          audioEngine.connectMicrophone();
      };

      recognitionInstance.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        if (text.trim()) {
            isProcessingRef.current = true;
            recognitionInstance.stop();
            handleSendMessageRef.current(text);
        }
      };

      recognitionInstance.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
            setIsListening(false);
        }
      };
      
      recognitionInstance.onend = () => {
        setIsListening(false);
        if (voiceModeRef.current && !isProcessingRef.current) {
            try { recognitionInstance.start(); } catch(e) {}
        }
      };

      setRecognition(recognitionInstance);
    }
  }, []);

  const toggleVoiceMode = () => {
    if (!recognition) {
        alert("Speech recognition not supported.");
        return;
    }
    audioEngine.init();
    
    if (voiceMode) {
        setVoiceMode(false);
        recognition.stop();
        audioEngine.stopSpeech();
        setIsListening(false);
    } else {
        setVoiceMode(true);
        try { recognition.start(); } catch(e) {}
    }
  };

  const toggleAmbient = () => {
    audioEngine.init(); 
    const newState = !ambientEnabled;
    setAmbientEnabled(newState);
    audioEngine.toggleAmbient(newState);
  };

  const toggleMute = () => {
      const newState = !isMuted;
      setIsMuted(newState);
      audioEngine.toggleMute(newState);
  };
  
  const toggleVoice = () => {
      setCurrentVoiceId(prev => prev === VOICE_HELIOS_ID ? VOICE_ELARA_ID : VOICE_HELIOS_ID);
  };

  const handleMusicVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setMusicVolume(val);
      audioEngine.setMusicVolume(val);
  };

  return (
    <div className="relative w-full h-screen bg-black text-white flex flex-col overflow-hidden select-none animate-fade-in">
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a1525] to-[#020205] pointer-events-none z-0" />

      {/* Intro Screen Overlay */}
      <div 
        className={`absolute inset-0 z-[60] flex flex-col items-center justify-between py-24 cursor-pointer transition-all duration-1000 ease-in-out transform ${hasStarted ? '-translate-y-full opacity-0' : 'translate-y-0 opacity-100'}`}
        onClick={handleStartApp}
      >
          {/* Radial Gradient Vignette: Transparent center (35%) reveals the breathing circle */}
          <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(0,0,0,0)_35%,rgba(0,0,0,1)_85%)] -z-10" />
          
          <div className="text-center space-y-4">
               <h1 className="text-4xl font-light tracking-[0.5em] text-white/90">HELIOS</h1>
          </div>

          <div className="text-center">
              <p className="text-gray-400 font-light tracking-widest text-xs uppercase animate-pulse">Tap to begin</p>
          </div>
      </div>

      <Visualizer 
        state={getVisualizerState()} 
        isAmbient={ambientEnabled} 
        voiceType={currentVoiceId === VOICE_HELIOS_ID ? 'helios' : 'elara'}
      />

      {/* Header - Fixed overflow logic for mobile to prevent clipping */}
      <header className={`fixed top-0 left-0 w-full px-4 md:px-8 py-4 md:py-6 flex justify-between items-center z-50 pointer-events-none transition-opacity duration-1000 ${hasStarted ? 'opacity-100' : 'opacity-0'}`}>
        <div className="flex items-center gap-3 pointer-events-auto shrink-0">
            <h1 className="text-lg md:text-xl font-light tracking-[0.3em] text-white/80">HELIOS</h1>
        </div>
        
        {/* Controls Container with horizontal scroll for mobile */}
        <div className="flex gap-2 md:gap-4 items-center pointer-events-auto bg-black/20 backdrop-blur-md p-2 rounded-full border border-white/5 transition-opacity hover:bg-black/30 overflow-x-auto no-scrollbar max-w-[60vw] md:max-w-none">
            <div className={`transition-all duration-500 overflow-hidden flex items-center shrink-0 ${ambientEnabled ? 'w-24 md:w-32 opacity-100 mr-2' : 'w-0 opacity-0'}`}>
                <span className="text-[8px] md:text-[10px] text-gray-400 mr-2">MUSIC</span>
                <input 
                    type="range" min="0" max="1" step="0.01" 
                    value={musicVolume} onChange={handleMusicVolumeChange}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-indigo-400"
                />
            </div>

            <button onClick={toggleAmbient} className={`p-2 rounded-full transition-all duration-500 shrink-0 ${ambientEnabled ? 'bg-indigo-500/30 text-indigo-200' : 'text-gray-400 hover:text-white'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 md:w-5 md:h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-2.863-2.538l.477-.136a2.25 2.25 0 011.716.322M9 14.25l-2.496-2.496a3.375 3.375 0 00-4.773 4.773L9 21.3m0-12.3v5.275a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-2.863-2.538l.477-.136a2.25 2.25 0 011.716.322" />
                </svg>
            </button>

            <button onClick={toggleMute} className={`p-2 rounded-full transition-all duration-300 shrink-0 ${isMuted ? 'bg-red-900/30 text-red-400' : 'text-gray-400 hover:text-white'}`}>
                {isMuted ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 md:w-5 md:h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 9.75L19.5 12m0 0l2.25 2.25M19.5 12l2.25-2.25M19.5 12l-2.25 2.25m-10.5-6l4.72-4.72a.75.75 0 011.28.531V19.94a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.506-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.395C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 md:w-5 md:h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" /></svg>
                )}
            </button>

            <div className="h-4 w-px bg-white/10 mx-1 shrink-0"></div>

            {/* Voice Toggle */}
            <button onClick={toggleVoice} className={`flex flex-col items-center px-3 py-1 text-[8px] md:text-[10px] uppercase tracking-widest rounded-full transition-all cursor-pointer shrink-0 ${currentVoiceId === VOICE_ELARA_ID ? 'text-pink-300' : 'text-blue-200 hover:text-white'}`}>
                <span className="font-semibold">{currentVoiceId === VOICE_HELIOS_ID ? 'HELIOS' : 'ELARA'}</span>
            </button>
            
            <div className="h-4 w-px bg-white/10 mx-1 shrink-0"></div>

            <button onClick={() => setUseDeepThinking(!useDeepThinking)} className={`flex flex-col items-center px-3 py-1 text-[8px] md:text-[10px] uppercase tracking-widest rounded-full transition-all cursor-pointer shrink-0 ${useDeepThinking ? 'text-purple-300' : 'text-gray-400 hover:text-white'}`}>
                <span className="font-semibold">{useDeepThinking ? 'WISDOM' : 'CASUAL'}</span>
            </button>
        </div>
      </header>

      <main className={`flex-1 flex flex-col relative z-30 h-full overflow-hidden transition-opacity duration-1000 ${hasStarted ? 'opacity-100' : 'opacity-0'}`}>
        <ChatInterface 
            messages={messages} 
            onSendMessage={handleSendMessage} 
            isTyping={isTyping}
            modelIsThinking={useDeepThinking}
            agentName={currentAgentName}
        />
        
        <div className="absolute bottom-36 left-1/2 transform -translate-x-1/2 z-40">
            <button onClick={toggleVoiceMode} className={`p-6 rounded-full transition-all duration-500 transform hover:scale-105 cursor-pointer backdrop-blur-xl border ${voiceMode ? 'bg-red-500/20 text-red-300 border-red-500/30 shadow-[0_0_40px_rgba(255,50,50,0.2)] animate-pulse' : 'bg-white/5 text-white/90 border-white/10 hover:bg-white/10 shadow-lg'}`}>
                {voiceMode ? (
                   isListening ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>
                   ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 animate-spin"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                   )
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.2} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" /></svg>
                )}
            </button>
            {voiceMode && (
                <div className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 w-max">
                    <span className="text-[10px] uppercase tracking-widest text-red-200/50">
                        {isListening ? "Listening..." : "Conversing..."}
                    </span>
                </div>
            )}
        </div>
      </main>
    </div>
  );
};

export default App;
