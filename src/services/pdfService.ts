import * as pdfjsLib from "pdfjs-dist";
// @ts-ignore
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import { PDFDocument, PDFPage } from '../types';

// Set worker source
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export async function getPageImage(file: File, pageNumber: number, boundingBox?: { ymin: number, xmin: number, ymax: number, xmax: number }): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const page = await pdf.getPage(pageNumber);
  
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) throw new Error('Could not create canvas context');
  
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  
  await page.render({
    canvasContext: context,
    viewport: viewport,
    canvas: canvas
  }).promise;

  if (boundingBox) {
    const { ymin, xmin, ymax, xmax } = boundingBox;
    // Normalized coordinates (0-1000) to canvas pixels
    const cropX = (xmin / 1000) * canvas.width;
    const cropY = (ymin / 1000) * canvas.height;
    const cropWidth = ((xmax - xmin) / 1000) * canvas.width;
    const cropHeight = ((ymax - ymin) / 1000) * canvas.height;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;
    const cropContext = cropCanvas.getContext('2d');
    
    if (cropContext) {
      cropContext.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
      return cropCanvas.toDataURL('image/png');
    }
  }
  
  return canvas.toDataURL('image/png');
}

export async function extractTextFromPDF(file: File): Promise<PDFDocument> {
  console.log('Starting PDF extraction for:', file.name);
  const arrayBuffer = await file.arrayBuffer();
  
  try {
    const loadingTask = pdfjsLib.getDocument({ 
      data: arrayBuffer,
      useSystemFonts: true,
      isEvalSupported: false
    });
    
    const pdf = await loadingTask.promise;
    console.log(`PDF loaded. Pages: ${pdf.numPages}`);
    
    const pages: PDFPage[] = [];
    let totalTextLength = 0;
    let partialFailure = false;

    for (let i = 1; i <= pdf.numPages; i++) {
      try {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const text = textContent.items
          .map((item: any) => item.str)
          .join(' ');
        
        const cleanedText = text.trim();
        totalTextLength += cleanedText.length;
        
        pages.push({
          pageNumber: i,
          text: cleanedText
        });
      } catch (pageError) {
        console.error(`Error extracting text from page ${i}:`, pageError);
        partialFailure = true;
        // Continue with next page
      }
    }

    console.log(`Extraction complete. Total characters: ${totalTextLength}`);
    
    if (totalTextLength === 0) {
      console.warn('No text extracted from PDF. It might be a scanned document or image-based.');
    }

    return {
      name: file.name,
      pages,
      partialFailure
    };
  } catch (error) {
    console.error('Error in extractTextFromPDF:', error);
    throw error;
  }
}
