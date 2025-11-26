
import { jsPDF } from 'jspdf';
import mammoth from 'mammoth';

/**
 * Trigger browser download for text content in various formats.
 */
export const generateExport = (content: string, title: string, format: 'pdf' | 'docx' | 'txt' | 'odt' | 'rtf') => {
  const safeTitle = title.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
  const filename = `${safeTitle}.${format}`;
  
  if (format === 'pdf') {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 10;
    const maxLineWidth = pageWidth - margin * 2;
    
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text(title, margin, 20);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    
    // Split text to fit page
    const lines = doc.splitTextToSize(content, maxLineWidth);
    let y = 30;
    
    lines.forEach((line: string) => {
      if (y > 280) {
        doc.addPage();
        y = 20;
      }
      doc.text(line, margin, y);
      y += 5; // Line height
    });
    
    doc.save(filename);
    
  } else {
    // For Word/RTF/ODT, we use a simple HTML wrapping method which works well in most cases
    // without needing heavy binary libraries.
    let mimeType = 'text/plain';
    let blobData = content;

    if (format === 'docx' || format === 'odt' || format === 'rtf') {
      mimeType = format === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : 'application/rtf';
      // Create a basic HTML wrapper that Word/LibreOffice can interpret
      blobData = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head><meta charset='utf-8'><title>${title}</title></head>
        <body style="font-family: Arial, sans-serif;">
          <h1>${title}</h1>
          <p style="white-space: pre-wrap;">${content}</p>
        </body>
        </html>
      `;
    }

    const blob = new Blob([blobData], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};
