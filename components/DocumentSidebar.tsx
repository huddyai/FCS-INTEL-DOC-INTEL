
import React from 'react';
import { DocumentStats, UploadedFile } from '../types';

interface DocumentSidebarProps {
  file: UploadedFile | null;
  stats: DocumentStats | null;
  onReset: () => void;
}

const DocumentSidebar: React.FC<DocumentSidebarProps> = ({ file, stats, onReset }) => {
  if (!file) return null;

  return (
    <div className="w-80 bg-white border-l border-slate-200 h-full flex flex-col shadow-xl z-20">
      
      {/* Header */}
      <div className="p-6 border-b border-slate-100">
        <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Document Details</h2>
        <div className="flex items-start space-x-3">
          <div className="p-3 bg-[#92C973]/10 rounded-lg">
             <svg className="w-6 h-6 text-[#92C973]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          </div>
          <div className="flex-1 overflow-hidden">
             <h3 className="font-bold text-[#002A4E] truncate" title={file.name}>{file.name}</h3>
             <p className="text-xs text-slate-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB • {file.name.split('.').pop()?.toUpperCase()}</p>
          </div>
        </div>
      </div>

      {/* Stats Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        
        {/* Quick Summary */}
        <div>
           <h3 className="text-sm font-bold text-[#002A4E] mb-3 flex items-center">
             <svg className="w-4 h-4 mr-2 text-[#00B5E2]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
             AI Summary
           </h3>
           <div className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden min-h-[120px] relative">
              {stats?.summary ? (
                  <div className="p-4 text-sm text-slate-600 leading-relaxed">
                    {stats.summary}
                  </div>
              ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm">
                    {/* Branded Loading Animation */}
                    <div className="flex space-x-1 mb-3 h-6 items-end">
                        <div className="w-1.5 bg-[#002A4E] rounded-t animate-[pulse_1s_ease-in-out_infinite]" style={{height: '60%'}}></div>
                        <div className="w-1.5 bg-[#00B5E2] rounded-t animate-[pulse_1s_ease-in-out_0.2s_infinite]" style={{height: '100%'}}></div>
                        <div className="w-1.5 bg-[#92C973] rounded-t animate-[pulse_1s_ease-in-out_0.4s_infinite]" style={{height: '40%'}}></div>
                        <div className="w-1.5 bg-[#002A4E] rounded-t animate-[pulse_1s_ease-in-out_0.1s_infinite]" style={{height: '80%'}}></div>
                    </div>
                    <span className="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#002A4E] to-[#00B5E2] animate-pulse">
                        Analyzing Content...
                    </span>
                    <div className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-[#002A4E] via-[#00B5E2] to-[#92C973] w-full animate-pulse"></div>
                  </div>
              )}
           </div>
        </div>

        {/* Key Topics */}
        <div>
           <h3 className="text-sm font-bold text-[#002A4E] mb-3 flex items-center">
             <svg className="w-4 h-4 mr-2 text-[#00B5E2]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
             Key Topics
           </h3>
           <div className="flex flex-wrap gap-2">
              {stats?.keyTopics ? (
                stats.keyTopics.map((topic, i) => (
                  <span key={i} className="px-3 py-1.5 bg-[#92C973]/10 text-[#002A4E] text-xs font-bold rounded-full border border-[#92C973]/20 hover:bg-[#92C973]/20 transition-colors cursor-default">
                    #{topic}
                  </span>
                ))
              ) : (
                <>
                  {/* Ghost Tags Loading State */}
                  <div className="h-7 w-20 bg-[#002A4E]/5 rounded-full border border-[#002A4E]/10 animate-pulse"></div>
                  <div className="h-7 w-24 bg-[#00B5E2]/5 rounded-full border border-[#00B5E2]/10 animate-pulse delay-75"></div>
                  <div className="h-7 w-16 bg-[#92C973]/5 rounded-full border border-[#92C973]/10 animate-pulse delay-150"></div>
                  <div className="h-7 w-20 bg-slate-100 rounded-full animate-pulse delay-100"></div>
                </>
              )}
           </div>
        </div>
        
        {/* Sentiment Analysis Placeholder (optional visual filler) */}
         {stats?.sentiment && (
             <div>
                <h3 className="text-sm font-bold text-[#002A4E] mb-3 flex items-center">
                    <svg className="w-4 h-4 mr-2 text-[#00B5E2]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    Sentiment
                </h3>
                <div className="flex items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className={`w-3 h-3 rounded-full mr-2 ${
                        stats.sentiment.toLowerCase().includes('positive') ? 'bg-[#92C973]' : 
                        stats.sentiment.toLowerCase().includes('negative') ? 'bg-red-400' : 'bg-amber-400'
                    }`}></div>
                    <span className="text-sm text-slate-600 font-medium capitalize">{stats.sentiment}</span>
                </div>
             </div>
         )}

      </div>

      {/* Footer / Reset */}
      <div className="p-6 border-t border-slate-100 bg-slate-50">
        <button 
          onClick={onReset}
          className="w-full py-3 px-4 bg-white border border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-[#002A4E] hover:text-white hover:border-[#002A4E] transition-all flex items-center justify-center space-x-2 shadow-sm hover:shadow-md"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
          <span>Analyze New Document</span>
        </button>
      </div>

    </div>
  );
};

export default DocumentSidebar;
