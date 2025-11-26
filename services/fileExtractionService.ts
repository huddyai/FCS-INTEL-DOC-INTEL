import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// --- PDF SETUP ---
const lib = (pdfjsLib as any).default || pdfjsLib;
if (lib.GlobalWorkerOptions) {
  lib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
}

/**
 * Main entry point to extract text from various file types.
 */
export const extractTextFromFile = async (file: File): Promise<string> => {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();

  if (type === 'application/pdf' || name.endsWith('.pdf')) {
    return extractTextFromPDF(file);
  } else if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
    name.endsWith('.docx')
  ) {
    return extractTextFromDOCX(file);
  } else if (
    type === 'application/msword' || 
    name.endsWith('.doc')
  ) {
    return extractTextFromBinaryDoc(file);
  } else if (type === 'text/plain' || name.endsWith('.txt')) {
    return extractTextFromTXT(file);
  } else if (type === 'text/html' || name.endsWith('.html') || name.endsWith('.htm')) {
    return extractTextFromHTML(file);
  } else if (type === 'application/rtf' || type === 'text/rtf' || name.endsWith('.rtf')) {
    return extractTextFromRTF(file);
  } else {
    throw new Error(`Unsupported file type: ${file.type}. Please upload PDF, DOC, DOCX, TXT, RTF, or HTML.`);
  }
};

/**
 * PDF Extraction
 */
const extractTextFromPDF = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = lib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  let fullText = '';
  const totalPages = pdf.numPages;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    fullText += `--- Page ${pageNum} ---\n${pageText}\n\n`;
  }
  return fullText;
};

/**
 * DOCX Extraction using Mammoth
 */
const extractTextFromDOCX = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  try {
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (error) {
    console.error("DOCX Extraction Error", error);
    throw new Error("Failed to extract text from DOCX file.");
  }
};

/**
 * Legacy DOC Extraction (Heuristic)
 * Extracts readable strings from binary files.
 */
const extractTextFromBinaryDoc = async (file: File): Promise<string> => {
  try {
    // We try to read as text first. If the file is properly encoded (e.g. windows-1252), browser might decode it.
    // However, binary control characters often mess this up.
    // A robust client-side way without heavy libraries is to filter standard printable characters.
    const arrayBuffer = await file.arrayBuffer();
    const decoder = new TextDecoder("utf-8", { fatal: false, ignoreBOM: true });
    const rawText = decoder.decode(arrayBuffer);
    
    // Simple heuristic: Keep printable characters, tabs, newlines.
    // Filter out sequences that look like binary garbage (long strings of non-space special chars).
    // This allows the AI to get the "Gist" of the document content.
    // \x20-\x7E is standard ASCII printable range.
    
    // 1. Remove Null bytes and control chars except newlines/tabs
    let cleanText = rawText.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");
    
    // 2. We might want to remove "garbage" blocks, but for now, raw string extraction is usually enough for LLM context.
    // The LLM is surprisingly good at ignoring the binary artifacts if the text is present.
    
    if (cleanText.length < 50) {
        // Fallback: try reading as binary string equivalent
        const uint8 = new Uint8Array(arrayBuffer);
        let str = "";
        for(let i=0; i<uint8.length; i++) {
            const char = uint8[i];
            if ((char >= 32 && char <= 126) || char === 10 || char === 13 || char === 9) {
                str += String.fromCharCode(char);
            }
        }
        cleanText = str;
    }

    return cleanText;
  } catch (error) {
    console.error("DOC Extraction Error", error);
    throw new Error("Failed to extract text from DOC file.");
  }
};

/**
 * TXT Extraction
 */
const extractTextFromTXT = async (file: File): Promise<string> => {
  return await file.text();
};

/**
 * HTML Extraction
 */
const extractTextFromHTML = async (file: File): Promise<string> => {
  const text = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/html');
  // Extract visible text only
  return doc.body.textContent || "";
};

/**
 * RTF Extraction (Basic Stripper)
 */
const extractTextFromRTF = async (file: File): Promise<string> => {
  const text = await file.text();
  // Basic RTF strip regex: removes control words and groups
  // This is a simplified approach for client-side without heavy parsers
  return text
    .replace(/\\par[d]?/g, "\n")
    .replace(/\{\*?\\[^{}]+}|[{}]|\\\n?[A-Za-z]+\n?(?:-?\d+)?[ ]?/g, "")
    .trim();
};