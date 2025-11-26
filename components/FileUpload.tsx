import React, { useCallback } from 'react';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect }) => {
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        validateAndSelect(e.dataTransfer.files[0]);
      }
    },
    [onFileSelect]
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSelect(e.target.files[0]);
    }
  };

  const validateAndSelect = (file: File) => {
    // Basic validation based on extension or broad types
    const validExtensions = ['.pdf', '.docx', '.doc', '.txt', '.rtf', '.html', '.htm'];
    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some(ext => fileName.endsWith(ext));

    if (isValid) {
      onFileSelect(file);
    } else {
      alert('Unsupported file format. Please upload PDF, DOC, DOCX, TXT, RTF, or HTML.');
    }
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="flex flex-col items-center justify-center w-full h-96 border-2 border-slate-300 border-dashed rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer group"
    >
      <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
        <div className="p-4 bg-white rounded-full shadow-sm mb-4 group-hover:scale-110 transition-transform duration-200">
           {/* FCS Green Icon Accent */}
           <svg className="w-8 h-8 text-[#92C973]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
        </div>
        <p className="mb-2 text-xl font-bold text-[#002A4E]">
          Upload Document
        </p>
        <p className="mb-4 text-sm text-slate-500">
          Drag & drop your file here, or click to browse.
          <br />
          <span className="text-xs text-slate-400 font-medium">Supported: PDF, DOC, DOCX, TXT, RTF, HTML (Max 3000 pages)</span>
        </p>
      </div>
      <label className="relative">
        <span className="px-6 py-2.5 bg-[#002A4E] text-white text-sm font-bold rounded-lg hover:bg-[#003865] transition-all shadow-md hover:shadow-lg cursor-pointer">
            Browse Files
        </span>
        <input 
            type="file" 
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            accept=".pdf,.docx,.doc,.txt,.rtf,.html,.htm,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain,application/rtf,text/html"
            onChange={handleChange}
        />
      </label>
    </div>
  );
};

export default FileUpload;