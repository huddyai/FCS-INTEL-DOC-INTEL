
import React, { useState, useRef, useEffect } from 'react';
import { Chat, GenerateContentResponse } from "@google/genai";
import ReactMarkdown from 'react-markdown';
import FileUpload from './components/FileUpload';
import DocumentSidebar from './components/DocumentSidebar';
import InteractiveBackground from './components/InteractiveBackground';
import VoiceAgent from './components/VoiceAgent';
import { Message, UploadedFile, ProcessingState, DocumentStats } from './types';
import { initializeChatWithDocument, sendMessageStream, analyzeDocumentMetadata, generateSpeechFromText } from './services/geminiService';
import { extractTextFromFile } from './services/fileExtractionService';
import { generateExport } from './services/exportService';
import { playPCMData } from './services/audioUtils';
import { SUGGESTED_QUESTIONS } from './constants';

// Add type definition for Web Speech API
interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}

const App: React.FC = () => {
  // State
  const [file, setFile] = useState<UploadedFile | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>(ProcessingState.IDLE);
  const [processingStatusText, setProcessingStatusText] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [stats, setStats] = useState<DocumentStats | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loadingMessageId, setLoadingMessageId] = useState<string | null>(null);

  // Refs
  const chatInstance = useRef<Chat | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const activeRequestRef = useRef<string | null>(null);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Clean up audio context on unmount
  useEffect(() => {
    return () => {
      audioContextRef.current?.close();
    };
  }, []);

  // Handlers
  const handleFileSelect = async (selectedFile: File) => {
    setProcessingState(ProcessingState.UPLOADING);
    setProcessingStatusText('Reading document...');
    setErrorMessage('');
    // Reset stats to ensure loading animation triggers
    setStats(null);
    
    // 1. Create UI file object
    const newFile: UploadedFile = {
      name: selectedFile.name,
      type: selectedFile.type,
      size: selectedFile.size,
      data: '' // We don't need to store the base64 for large text extraction
    };
    setFile(newFile);

    try {
      // 2. Extract Text (Client Side)
      setProcessingStatusText(`Extracting text from ${selectedFile.name}...`);
      const textContent = await extractTextFromFile(selectedFile);
      
      if (!textContent || textContent.trim().length === 0) {
        throw new Error("Could not extract text from this file. It might be empty or an image-only scan.");
      }

      setProcessingState(ProcessingState.ANALYZING);
      setProcessingStatusText('AI is analyzing content...');

      // 3. Initialize Chat with Text
      chatInstance.current = await initializeChatWithDocument(textContent, newFile.name);
      
      // 4. Get Metadata (Parallel)
      analyzeDocumentMetadata(textContent).then(data => {
          setStats(data);
      });

      // 5. Ready
      setProcessingState(ProcessingState.READY);
      setMessages([
        {
          id: 'system-1',
          role: 'model',
          content: `I have read **${selectedFile.name}** (${textContent.length.toLocaleString()} characters). I am ready to assist you.`,
          timestamp: new Date()
        }
      ]);
    } catch (error: any) {
      console.error("Initialization error:", error);
      setProcessingState(ProcessingState.ERROR);
      setErrorMessage(error.message || "An unexpected error occurred while analyzing the document.");
    }
  };

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || !chatInstance.current) return;

    const userMsgId = Date.now().toString();
    const newUserMsg: Message = {
      id: userMsgId,
      role: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, newUserMsg]);
    setInput('');

    const botMsgId = (Date.now() + 1).toString();
    // Add placeholder for streaming
    setMessages(prev => [...prev, {
      id: botMsgId,
      role: 'model',
      content: '',
      timestamp: new Date(),
      isStreaming: true
    }]);

    try {
      const stream = await sendMessageStream(chatInstance.current, text);
      
      let fullText = '';
      
      for await (const chunk of stream) {
        const chunkText = chunk.text || '';
        fullText += chunkText;
        
        setMessages(prev => prev.map(msg => 
          msg.id === botMsgId 
            ? { ...msg, content: fullText } 
            : msg
        ));
      }
      
      setMessages(prev => prev.map(msg => 
        msg.id === botMsgId 
          ? { ...msg, isStreaming: false } 
          : msg
      ));

    } catch (error) {
      console.error(error);
      setMessages(prev => prev.map(msg => 
        msg.id === botMsgId 
          ? { ...msg, content: "I encountered an error processing your request. Please try again.", isStreaming: false } 
          : msg
      ));
    }
  };

  /**
   * Pipeline Strategy for TTS:
   * Increased chunk size to ~500 chars to avoid premature cut-offs.
   */
  const handlePlayMessage = async (msgId: string, rawText: string) => {
    const requestId = Date.now().toString();
    activeRequestRef.current = requestId;

    // If already playing this message, stop it.
    if (playingMessageId === msgId && isPlaying) {
      currentSourceRef.current?.stop();
      setPlayingMessageId(null);
      setLoadingMessageId(null);
      setIsPlaying(false);
      return;
    }

    // Stop any other current playback
    if (currentSourceRef.current) {
      currentSourceRef.current.stop();
    }

    setPlayingMessageId(msgId);
    setLoadingMessageId(msgId); // Start loading state
    setIsPlaying(false);
    
    // Initialize Audio Context if needed
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioContextClass();
    }
    const audioContext = audioContextRef.current;
    
    // Ensure context is running (fixes browser autoplay blocks)
    if (audioContext.state === 'suspended') {
        await audioContext.resume();
    }

    // 1. Clean Text
    // Remove markdown symbols and hidden export data
    let cleanText = rawText
      .replace(/:::EXPORT_DATA=[\s\S]*?:::/g, '') // Remove hidden JSON
      .replace(/\*\*/g, '')  // Bold
      .replace(/##/g, '')    // Headers
      .replace(/\[.*?\]/g, '') // References
      .replace(/`/g, '')     // Code
      .trim();

    // 2. Chunking (Larger chunks for stability)
    // Split by punctuation (period, question mark, exclamation point) followed by space or end of string
    // This regex looks for sentence endings.
    // We try to keep chunks substantial (e.g. 300-500 chars) to reduce API calls
    const sentenceRegex = /[^.?!]+[.?!]+[\])'"]*|[^.?!]+$/g;
    const sentences = cleanText.match(sentenceRegex) || [cleanText];
    
    const processedChunks: string[] = [];
    let currentChunk = '';

    sentences.forEach(sentence => {
        if ((currentChunk + sentence).length < 500) {
            currentChunk += sentence + ' ';
        } else {
            if (currentChunk.trim()) processedChunks.push(currentChunk);
            currentChunk = sentence + ' ';
        }
    });
    if (currentChunk.trim()) processedChunks.push(currentChunk);

    try {
      // Pipeline: Play first chunk immediately, fetch others in background
      for (let i = 0; i < processedChunks.length; i++) {
        // Check race condition
        if (activeRequestRef.current !== requestId) return;
        // Check if user stopped playback via UI
        if (playingMessageId !== msgId && i > 0) break; 
        
        const chunk = processedChunks[i];
        if (!chunk.trim()) continue;

        // Fetch audio for this chunk
        const audioData = await generateSpeechFromText(chunk);
        
        // Before playing, check request ID again
        if (activeRequestRef.current !== requestId) return;

        if (audioData) {
           // On first chunk ready, switch from loading to playing
           if (i === 0) {
               setLoadingMessageId(null);
               setIsPlaying(true);
           }
           await playChunk(audioContext, audioData, requestId);
        }
      }
    } catch (e) {
      console.error("Playback error", e);
    } finally {
      // Only reset if this instance was the one playing
      if (activeRequestRef.current === requestId) {
          setPlayingMessageId(null);
          setLoadingMessageId(null);
          setIsPlaying(false);
      }
    }
  };

  const playChunk = async (ctx: AudioContext, base64PCM: string, requestId: string): Promise<void> => {
     return new Promise((resolve) => {
        // Double check before starting source
        if (activeRequestRef.current !== requestId) {
            resolve();
            return;
        }

        // Decode
        const binaryString = atob(base64PCM);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const float32Data = new Float32Array(bytes.length / 2);
        const dataView = new DataView(bytes.buffer);
        for (let i = 0; i < float32Data.length; i++) {
            const int16 = dataView.getInt16(i * 2, true);
            float32Data[i] = int16 < 0 ? int16 / 32768 : int16 / 32767;
        }

        const buffer = ctx.createBuffer(1, float32Data.length, 24000);
        buffer.getChannelData(0).set(float32Data);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        
        currentSourceRef.current = source;

        source.onended = () => {
            resolve();
        };
        source.start();
     });
  };

  const handleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as unknown as IWindow).SpeechRecognition || (window as unknown as IWindow).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => (prev ? prev + ' ' + transcript : transcript));
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        // Benign error, user just didn't speak. Reset state without scary alert.
        console.warn("No speech detected.");
      } else if (event.error === 'not-allowed') {
        alert("Microphone access was denied. Please check your browser permissions.");
      } else {
        console.error("Speech recognition error", event.error);
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (e) {
      console.error("Failed to start recognition", e);
      setIsListening(false);
    }
  };

  const resetApp = () => {
    setFile(null);
    setMessages([]);
    setStats(null);
    setErrorMessage('');
    chatInstance.current = null;
    setProcessingState(ProcessingState.IDLE);
    setIsVoiceMode(false);
    setPlayingMessageId(null);
    setLoadingMessageId(null);
    setIsPlaying(false);
    currentSourceRef.current?.stop();
  };

  // Helper to extract the EXPORT_DATA block from message content
  const extractExportData = (content: string) => {
    const match = content.match(/:::EXPORT_DATA=([\s\S]*?):::/);
    if (match && match[1]) {
      try {
        return JSON.parse(match[1]);
      } catch (e) {
        console.error("Failed to parse export data JSON", e);
        return null;
      }
    }
    return null;
  };

  // Helper to remove the EXPORT_DATA block for display
  const cleanDisplayContent = (content: string) => {
    return content.replace(/:::EXPORT_DATA=[\s\S]*?:::/g, '').trim();
  };

  const handleDownload = (data: any, format: 'pdf' | 'docx' | 'txt' | 'rtf' | 'odt') => {
      if (data && data.content) {
          generateExport(data.content, data.title || 'Export', format);
      }
  };

  return (
    <div className="flex h-screen bg-slate-50 relative overflow-hidden font-sans">
      
      {/* Interactive Background Layer */}
      <InteractiveBackground />
      
      {/* Voice Mode Overlay */}
      {isVoiceMode && chatInstance.current && (
        <VoiceAgent 
          chat={chatInstance.current} 
          onClose={() => setIsVoiceMode(false)} 
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative z-10 transition-all duration-300">
        
        {/* Header */}
        <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-200/60 flex items-center justify-between px-6 shadow-sm z-10">
          <div className="flex items-center space-x-3">
            {/* FCS Logo Recreation */}
            <div className="flex items-end cursor-pointer" onClick={resetApp}>
                <span className="text-3xl font-extrabold text-[#002A4E] leading-none tracking-tight">FCS</span>
                <div className="flex flex-col space-y-0.5 ml-1 mb-1">
                    <div className="flex space-x-0.5 ml-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#00B5E2]"></div>
                    </div>
                    <div className="flex space-x-0.5 ml-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#00B5E2]"></div>
                    </div>
                    <div className="flex space-x-0.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#00B5E2]"></div>
                    </div>
                </div>
            </div>
            <div className="h-6 w-px bg-slate-300 mx-2"></div>
            <h1 className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[#002A4E] via-[#005580] to-[#00B5E2] tracking-tight drop-shadow-sm">
              Internal Document Intelligence
            </h1>
          </div>
          
          <div className="flex items-center space-x-3">
             {file && processingState === ProcessingState.READY && (
                <button
                  disabled
                  className="hidden md:flex items-center space-x-2 px-4 py-2 bg-slate-100 text-slate-400 border border-slate-200 rounded-lg cursor-not-allowed shadow-sm text-sm font-bold"
                >
                   <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                   <span>Voice Agent (Coming Soon)</span>
                </button>
             )}

             {file && (
               <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-500 hover:bg-slate-100/50 rounded-md lg:hidden">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" /></svg>
               </button>
             )}
          </div>
        </header>

        {/* Body */}
        <main className="flex-1 overflow-hidden relative flex flex-col">
          
          {processingState === ProcessingState.IDLE && (
            <div className="flex-1 flex items-center justify-center p-6 animate-fade-in">
              <div className="w-full max-w-2xl space-y-8 bg-white/60 backdrop-blur-xl p-10 rounded-3xl shadow-xl border border-white/50">
                <div className="text-center space-y-5">
                  <div className="inline-block relative">
                    <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-[#002A4E] to-[#00B5E2]">
                      Document Intelligence Agent
                    </h2>
                    <div className="h-1 w-20 bg-[#92C973] rounded-full mx-auto mt-2"></div>
                  </div>
                  
                  <p className="text-slate-600 text-base max-w-2xl mx-auto leading-relaxed">
                    Upload strategy decks, reports, or contracts, and in seconds it automatically converts your file into a <span className="font-bold text-[#002A4E]">secure, private, intelligent AI agent</span> that can <span className="font-bold text-[#92C973]">analyze</span>, <span className="font-bold text-[#92C973]">summarize</span>, <span className="font-bold text-[#92C973]">extract key information</span>, <span className="font-bold text-[#92C973]">download specific pages</span>, and answer any question about your document.
                  </p>
                </div>
                <div className="bg-white/50 backdrop-blur-sm rounded-xl overflow-hidden shadow-inner">
                   <FileUpload onFileSelect={handleFileSelect} />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                    <div className="p-4 bg-white/70 backdrop-blur-md rounded-xl border border-white/50 shadow-sm hover:border-[#92C973] transition-colors group">
                        <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">⚡️</div>
                        <h3 className="font-bold text-[#002A4E]">Instant Summary</h3>
                    </div>
                    <div className="p-4 bg-white/70 backdrop-blur-md rounded-xl border border-white/50 shadow-sm hover:border-[#92C973] transition-colors group">
                        <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">🔍</div>
                        <h3 className="font-bold text-[#002A4E]">Fact Extraction</h3>
                    </div>
                    <div className="p-4 bg-white/70 backdrop-blur-md rounded-xl border border-white/50 shadow-sm hover:border-[#92C973] transition-colors group">
                        <div className="text-2xl mb-2 group-hover:scale-110 transition-transform">📄</div>
                        <h3 className="font-bold text-[#002A4E]">Page Downloads</h3>
                    </div>
                </div>
              </div>
            </div>
          )}

          {(processingState === ProcessingState.UPLOADING || processingState === ProcessingState.ANALYZING) && (
             <div className="flex-1 flex flex-col items-center justify-center space-y-6 bg-white/60 backdrop-blur-sm">
               <div className="relative w-24 h-24">
                 <div className="absolute inset-0 border-4 border-slate-200 rounded-full"></div>
                 <div className="absolute inset-0 border-4 border-[#92C973] rounded-full border-t-transparent animate-spin"></div>
               </div>
               <div className="text-center bg-white/80 p-6 rounded-2xl shadow-lg border border-white/50">
                 <h3 className="text-xl font-bold text-[#002A4E]">Processing Document...</h3>
                 <p className="text-slate-500 mt-2">{processingStatusText || 'Please wait...'}</p>
               </div>
             </div>
          )}

          {processingState === ProcessingState.ERROR && (
             <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-6">
                <div className="p-6 bg-red-50/90 backdrop-blur-sm rounded-full shadow-sm">
                    <svg className="w-10 h-10 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <div className="max-w-md bg-white/80 backdrop-blur-md p-8 rounded-2xl shadow-xl border border-white/50">
                    <h3 className="text-2xl font-bold text-[#002A4E] mb-2">Processing Error</h3>
                    <p className="text-slate-600 mb-6">
                        {errorMessage || "An unexpected error occurred while analyzing your document. Please try again."}
                    </p>
                    <button 
                        onClick={resetApp}
                        className="px-8 py-3 bg-[#002A4E] text-white font-bold rounded-lg hover:bg-[#003865] transition-all shadow-md"
                    >
                        Try Another File
                    </button>
                </div>
             </div>
          )}

          {processingState === ProcessingState.READY && (
            <>
              {/* Chat Area */}
              <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scrollbar-hide bg-white/50 backdrop-blur-sm">
                {messages.map((msg) => {
                  const exportData = msg.role === 'model' ? extractExportData(msg.content) : null;
                  const displayContent = msg.role === 'model' ? cleanDisplayContent(msg.content) : msg.content;

                  return (
                  <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex max-w-3xl ${msg.role === 'user' ? 'flex-row-reverse space-x-reverse' : 'flex-row'} space-x-4 items-start`}>
                      
                      {/* Avatar */}
                      <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center shadow-md ${msg.role === 'user' ? 'bg-[#002A4E]' : 'bg-[#00B5E2]'}`}>
                        {msg.role === 'user' ? (
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        ) : (
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        )}
                      </div>

                      <div className="flex flex-col space-y-2 max-w-full">
                          {/* Message Bubble */}
                          <div className={`p-5 rounded-2xl shadow-md text-sm leading-relaxed backdrop-blur-sm ${
                            msg.role === 'user' 
                              ? 'bg-[#002A4E]/95 text-white rounded-tr-none' 
                              : 'bg-white/90 text-slate-800 border border-white/50 rounded-tl-none'
                          }`}>
                            {msg.role === 'model' ? (
                                <div className="markdown-body prose prose-sm max-w-none prose-blue">
                                    <ReactMarkdown>{displayContent}</ReactMarkdown>
                                    {msg.isStreaming && <span className="inline-block w-2 h-4 ml-1 bg-[#92C973] animate-pulse"></span>}
                                </div>
                            ) : (
                                <p>{displayContent}</p>
                            )}
                            
                            {/* Metadata / TTS controls */}
                            <div className={`mt-2 text-xs opacity-70 flex items-center justify-between ${msg.role === 'user' ? 'text-slate-300' : 'text-slate-400'}`}>
                                <span>{msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                
                                {msg.role === 'model' && !msg.isStreaming && (
                                  <button 
                                    onClick={() => handlePlayMessage(msg.id, displayContent)}
                                    disabled={(playingMessageId !== null && playingMessageId !== msg.id) || loadingMessageId === msg.id}
                                    className={`
                                        ml-2 flex items-center space-x-2 px-3 py-1.5 rounded-full transition-all duration-200 shadow-sm
                                        ${playingMessageId === msg.id 
                                            ? 'bg-[#92C973]/20 text-[#002A4E] border border-[#92C973]/50 cursor-default' 
                                            : 'bg-slate-100 hover:bg-[#00B5E2] text-slate-600 hover:text-white border border-slate-200 hover:border-[#00B5E2] disabled:opacity-30'
                                        }
                                    `}
                                    title="Read aloud"
                                  >
                                    {loadingMessageId === msg.id ? (
                                        <>
                                           <svg className="animate-spin -ml-1 mr-2 h-3 w-3 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                           </svg>
                                           <span className="font-bold text-xs">Preparing...</span>
                                        </>
                                    ) : playingMessageId === msg.id ? (
                                      <>
                                        <div className="flex space-x-0.5 items-end h-3">
                                          <div className="w-0.5 bg-[#002A4E] h-full animate-[pulse_0.5s_ease-in-out_infinite]"></div>
                                          <div className="w-0.5 bg-[#002A4E] h-2/3 animate-[pulse_0.5s_ease-in-out_0.2s_infinite]"></div>
                                          <div className="w-0.5 bg-[#002A4E] h-1/3 animate-[pulse_0.5s_ease-in-out_0.4s_infinite]"></div>
                                        </div>
                                        <span className="font-bold text-xs">Playing...</span>
                                      </>
                                    ) : (
                                      <>
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                                        <span className="font-bold text-xs">Read Aloud</span>
                                      </>
                                    )}
                                  </button>
                                )}
                            </div>
                          </div>

                          {/* Export Data Toolbar */}
                          {exportData && (
                             <div className="bg-[#92C973]/10 border border-[#92C973]/30 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 animate-fade-in">
                                 <div className="flex items-center space-x-3">
                                     <div className="p-2 bg-white rounded-full text-[#92C973] shadow-sm">
                                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                                     </div>
                                     <div className="text-sm">
                                         <span className="block font-bold text-[#002A4E]">Content Ready for Download</span>
                                         <span className="text-xs text-slate-600">Select your preferred format:</span>
                                     </div>
                                 </div>
                                 <div className="flex items-center space-x-2">
                                     {['pdf', 'docx', 'txt', 'rtf'].map(fmt => (
                                         <button
                                           key={fmt}
                                           onClick={() => handleDownload(exportData, fmt as any)}
                                           className="px-3 py-1.5 bg-white border border-[#92C973]/30 text-[#002A4E] text-xs font-bold rounded-lg hover:bg-[#92C973] hover:text-white transition-colors uppercase shadow-sm"
                                         >
                                           {fmt}
                                         </button>
                                     ))}
                                 </div>
                             </div>
                          )}
                      </div>

                    </div>
                  </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-4 bg-white/80 backdrop-blur-md border-t border-slate-200/60 z-10">
                <div className="max-w-4xl mx-auto space-y-4">
                  
                  {/* Suggestions - Always visible with branded scrollbar */}
                   <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin touch-pan-x">
                      {stats?.suggestedQuestions && stats.suggestedQuestions.length > 0 ? (
                        stats.suggestedQuestions.map((q, i) => (
                           <button 
                             key={`suggested-${i}`} 
                             onClick={() => handleSendMessage(q)}
                             className="whitespace-nowrap px-4 py-2 bg-white/80 border border-slate-200 rounded-full text-xs text-slate-600 hover:bg-[#92C973]/10 hover:text-[#002A4E] hover:border-[#92C973] transition-colors font-medium shadow-sm backdrop-blur-sm flex-shrink-0"
                           >
                             {q}
                           </button>
                        ))
                      ) : (
                        SUGGESTED_QUESTIONS.map((q, i) => (
                           <button 
                             key={i} 
                             onClick={() => handleSendMessage(q)}
                             className="whitespace-nowrap px-4 py-2 bg-white/80 border border-slate-200 rounded-full text-xs text-slate-600 hover:bg-[#92C973]/10 hover:text-[#002A4E] hover:border-[#92C973] transition-colors font-medium shadow-sm backdrop-blur-sm flex-shrink-0"
                           >
                             {q}
                           </button>
                        ))
                      )}
                   </div>

                  <div className="relative flex items-center">
                    {/* Microphone Button */}
                    <button
                      onClick={handleVoiceInput}
                      className={`absolute left-2 p-2 rounded-full transition-all ${
                        isListening 
                          ? 'bg-red-100 text-red-500 animate-pulse' 
                          : 'text-slate-400 hover:text-[#00B5E2] hover:bg-slate-100'
                      }`}
                      title="Speak to type"
                    >
                      {isListening ? (
                         <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
                      ) : (
                         <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                      )}
                    </button>

                    <input 
                      type="text"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSendMessage(input)}
                      placeholder="Ask about dates, risks, or ask to draft an edited section..."
                      className="w-full pl-12 pr-12 py-4 bg-white/90 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#92C973]/20 focus:border-[#92C973] transition-all text-slate-700 placeholder-slate-400 shadow-inner"
                    />
                    <button 
                      onClick={() => handleSendMessage(input)}
                      disabled={!input.trim()}
                      className="absolute right-3 p-2 bg-[#002A4E] text-white rounded-lg hover:bg-[#003865] disabled:opacity-50 disabled:hover:bg-[#002A4E] transition-colors shadow-md"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M12 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                  <p className="text-center text-xs text-slate-500 font-medium">
                    Your documents and conversations are encrypted in transit and at rest, stay fully private to your account, and are never used to train any external AI models.
                  </p>
                </div>
              </div>
            </>
          )}
        </main>
      </div>

      {/* Sidebar (Desktop: Fixed, Mobile: Toggle) */}
      <div className={`fixed inset-y-0 right-0 transform lg:transform-none lg:static transition-transform duration-300 z-30 ${isSidebarOpen && file ? 'translate-x-0' : 'translate-x-full lg:translate-x-full lg:hidden'}`}>
        <DocumentSidebar file={file} stats={stats} onReset={resetApp} />
      </div>
      
      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && file && (
          <div 
            className="fixed inset-0 bg-black/20 backdrop-blur-sm z-20 lg:hidden"
            onClick={() => setIsSidebarOpen(false)}
          ></div>
      )}

    </div>
  );
};

export default App;
