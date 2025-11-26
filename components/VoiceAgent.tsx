import React, { useEffect, useState, useRef } from 'react';
import { Chat, GenerateContentResponse } from "@google/genai";
import { generateSpeechFromText } from '../services/geminiService';
import { playPCMData } from '../services/audioUtils';

interface VoiceAgentProps {
  chat: Chat;
  onClose: () => void;
}

// Type for Web Speech API
interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

const VoiceAgent: React.FC<VoiceAgentProps> = ({ chat, onClose }) => {
  const [status, setStatus] = useState<'listening' | 'processing' | 'synthesizing' | 'speaking' | 'error'>('listening');
  const [transcript, setTranscript] = useState('');
  const [aiResponseText, setAiResponseText] = useState('');
  
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const transcriptRef = useRef(''); // Use Ref to avoid stale closures in callbacks

  useEffect(() => {
    startListening();
    
    // Initialize Audio Context
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();

    return () => {
      stopListening();
      audioContextRef.current?.close();
    };
  }, []);

  const startListening = () => {
    const SpeechRecognition = (window as unknown as IWindow).SpeechRecognition || (window as unknown as IWindow).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setStatus('error');
      setAiResponseText("Speech recognition not supported.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setStatus('listening');
      transcriptRef.current = '';
      setTranscript('');
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
            // Interim
             setTranscript(event.results[i][0].transcript);
        }
      }
      if (finalTranscript) {
         transcriptRef.current = finalTranscript;
         setTranscript(finalTranscript);
      }
    };

    recognition.onend = () => {
      const text = transcriptRef.current;
      if (text && text.trim().length > 0) {
        handleUserQuery(text);
      } else {
        // Restart listening if nothing was caught (loop)
        try {
            recognition.start();
        } catch(e) { /* ignore already started error */ }
      }
    };
    
    recognition.onerror = (event: any) => {
       if(event.error === 'no-speech') {
           // ignore
       } else {
           console.error("Speech error", event.error);
       }
    };

    recognitionRef.current = recognition;
    try {
        recognition.start();
    } catch(e) {
        console.error("Start error", e);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const handleUserQuery = async (text: string) => {
    setStatus('processing');
    
    try {
      // 1. Get Text Response from Gemini
      const response = await chat.sendMessage({ message: text });
      const responseText = response.text || "";
      setAiResponseText(responseText);

      // 2. Synthesize Speech (TTS)
      setStatus('synthesizing');
      const audioData = await generateSpeechFromText(responseText);

      if (audioData && audioContextRef.current) {
        setStatus('speaking');
        // 3. Play Audio
        await playPCMData(audioContextRef.current, audioData);
        // 4. Resume Listening after speaking
        startListening();
      } else {
        // Fallback if audio fails
        console.warn("Audio generation failed, returning to listening");
        startListening();
      }

    } catch (error) {
      console.error("Voice Agent Error:", error);
      setAiResponseText("I'm sorry, I encountered an error.");
      setStatus('error');
      setTimeout(() => startListening(), 3000);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-900/90 backdrop-blur-xl transition-all duration-500">
      <button 
        onClick={onClose}
        className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
      >
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>

      <div className="flex flex-col items-center max-w-2xl w-full px-6">
        
        {/* Animated Orb */}
        <div className="relative mb-12">
           <div className={`w-32 h-32 rounded-full blur-2xl absolute inset-0 transition-colors duration-500 ${
               status === 'listening' ? 'bg-[#00B5E2]/40' :
               status === 'processing' ? 'bg-[#92C973]/40' :
               status === 'speaking' ? 'bg-[#00B5E2]/60' : 'bg-red-500/40'
           }`}></div>
           
           <div className={`relative w-32 h-32 rounded-full border-4 flex items-center justify-center transition-all duration-500 ${
               status === 'speaking' ? 'scale-110 border-[#00B5E2] shadow-[0_0_50px_rgba(0,181,226,0.6)]' :
               status === 'processing' || status === 'synthesizing' ? 'animate-pulse border-[#92C973] shadow-[0_0_30px_rgba(146,201,115,0.4)]' :
               status === 'error' ? 'border-red-500' :
               'border-slate-400 shadow-[0_0_20px_rgba(255,255,255,0.1)]'
           }`}>
              {status === 'listening' && (
                  <div className="w-4 h-4 bg-white rounded-full animate-ping"></div>
              )}
              {status === 'speaking' && (
                  <div className="flex space-x-1 h-8 items-center">
                      <div className="w-1 bg-white animate-[bounce_1s_infinite] h-4"></div>
                      <div className="w-1 bg-white animate-[bounce_1s_infinite_0.1s] h-8"></div>
                      <div className="w-1 bg-white animate-[bounce_1s_infinite_0.2s] h-6"></div>
                      <div className="w-1 bg-white animate-[bounce_1s_infinite_0.1s] h-8"></div>
                      <div className="w-1 bg-white animate-[bounce_1s_infinite] h-4"></div>
                  </div>
              )}
           </div>
        </div>

        {/* Status Text */}
        <h2 className="text-2xl font-bold text-white mb-4 tracking-wide">
            {status === 'listening' && "Listening..."}
            {status === 'processing' && "Thinking..."}
            {status === 'synthesizing' && "Synthesizing Voice..."}
            {status === 'speaking' && "Speaking..."}
            {status === 'error' && "Error"}
        </h2>

        {/* Transcripts */}
        <div className="w-full text-center space-y-4">
            <p className="text-xl text-slate-300 min-h-[1.5em] font-light">
                "{transcript || (status === 'listening' ? '...' : '')}"
            </p>
            
            {aiResponseText && status !== 'listening' && (
                <div className="mt-8 p-6 bg-white/5 rounded-2xl border border-white/10 text-slate-200 text-sm max-h-48 overflow-y-auto">
                    {aiResponseText}
                </div>
            )}
        </div>

        {/* Controls */}
        <div className="mt-12 flex gap-4">
            {status === 'listening' ? (
                 <button onClick={stopListening} className="px-6 py-2 bg-red-500/20 text-red-300 border border-red-500/50 rounded-full hover:bg-red-500/30 transition-colors">
                    Stop Listening
                 </button>
            ) : (
                 <button onClick={startListening} className="px-6 py-2 bg-[#92C973]/20 text-[#92C973] border border-[#92C973]/50 rounded-full hover:bg-[#92C973]/30 transition-colors">
                    Tap to Speak
                 </button>
            )}
        </div>

      </div>
    </div>
  );
};

export default VoiceAgent;