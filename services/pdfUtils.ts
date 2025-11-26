import * as pdfjsLib from 'pdfjs-dist';

// In some ESM builds (like CDN), the library is on the 'default' property.
const lib = (pdfjsLib as any).default || pdfjsLib;

// Set the worker source to the CDN version to ensure it loads correctly in the browser environment
if (lib.GlobalWorkerOptions) {
  lib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
}

/**
 * Extracts all text from a PDF file.
 * Returns a single string containing all the text.
 */
export const extractTextFromPDF = async (file: File): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  
  // Load the PDF document
  // Use the 'lib' reference which accounts for the default export
  const loadingTask = lib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  let fullText = '';
  const totalPages = pdf.numPages;

  // Iterate through all pages
  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    // Combine text items with a space
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');

    fullText += `--- Page ${pageNum} ---\n${pageText}\n\n`;
  }

  return fullText;
};