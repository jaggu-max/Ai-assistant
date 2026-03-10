import { GoogleGenAI, Type, ThinkingLevel } from "@google/genai";
import { PDFDocument, QueryResult } from "../types";
import { getPageImage } from "./pdfService";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export async function queryPDF(doc: PDFDocument, question: string, originalFile: File): Promise<QueryResult> {
  // Check if document has any text
  const totalText = doc.pages.map(p => p.text).join('').trim();
  if (!totalText) {
    return {
      answer: "The provided document appears to be empty or contains only images. I cannot extract text from it to answer your question.",
      pageNumber: "N/A",
      contextSnippet: "N/A",
      explanation: "The PDF extraction process didn't find any readable text. This usually happens with scanned documents or PDFs that only contain images."
    };
  }

  // Step 1: Analyze the entire document text to find the answer AND the best page for visual evidence
  const context = doc.pages
    .filter(p => p.text.length > 0)
    .map(p => `[PAGE ${p.pageNumber}]\n${p.text}`)
    .join('\n\n');

  const analysisInstruction = `You are an expert PDF Document Analyzer. 
  Your goal is to answer the user's question based on the provided text context from multiple pages.
  
  Instructions:
  1. Read the entire context carefully.
  2. Identify the specific page number that contains the most relevant visual evidence (diagram, table, or specific paragraph) for the answer.
  3. Provide a comprehensive answer based on the text.
  4. Provide a brief explanation.
  
  Return JSON:
  {
    "textAnswer": "Comprehensive answer based on all pages",
    "explanation": "Simple explanation",
    "targetPageNumber": number,
    "found": boolean
  }`;

  let analysis;
  try {
    const analysisResponse = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [{ text: `Context:\n${context}\n\nQuestion: ${question}` }],
      config: { 
        systemInstruction: analysisInstruction,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH }
      }
    });
    analysis = JSON.parse(analysisResponse.text);
  } catch (err) {
    console.error("Analysis error:", err);
    return {
      answer: "I encountered an error while analyzing the document text.",
      pageNumber: "N/A",
      contextSnippet: "N/A",
      explanation: "There was a technical problem processing the document content."
    };
  }

  const targetPage = doc.pages.find(p => p.pageNumber === analysis.targetPageNumber);

  if (!analysis.found || !targetPage) {
    return {
      answer: analysis.textAnswer || "Answer not found in the uploaded PDF.",
      pageNumber: "N/A",
      contextSnippet: "N/A",
      explanation: analysis.explanation || "I searched the document but couldn't find a specific answer to your question."
    };
  }

  // Step 2: Get the page image and use Gemini Vision to get the specific crop
  try {
    const pageImageUrl = await getPageImage(originalFile, analysis.targetPageNumber);
    const base64Image = pageImageUrl.split(',')[1];

    const visionInstruction = `You are a Visual PDF Assistant.
    You are given a page image and a question.
    
    Instructions:
    1. Locate the specific visual element (diagram, table, or text block) that supports the answer: "${analysis.textAnswer}".
    2. Provide the bounding box [ymin, xmin, ymax, xmax] for that specific element.
    3. Provide the exact text found within or near that element.
    
    Rules:
    - Coordinates must be normalized (0-1000).
    - If no specific diagram is found, provide a box for the most relevant text area.
    
    Return JSON:
    {
      "exactText": "Text from the image",
      "boundingBox": { "ymin": number, "xmin": number, "ymax": number, "xmax": number },
      "contextSnippet": "3-5 lines of context"
    }`;

    const visionResponse = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: [
        {
          parts: [
            { text: `Question: ${question}\nContext Answer: ${analysis.textAnswer}\nThis is Page ${analysis.targetPageNumber}.` },
            { inlineData: { mimeType: "image/png", data: base64Image } }
          ]
        }
      ],
      config: {
        systemInstruction: visionInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            exactText: { type: Type.STRING },
            boundingBox: {
              type: Type.OBJECT,
              properties: {
                ymin: { type: Type.NUMBER },
                xmin: { type: Type.NUMBER },
                ymax: { type: Type.NUMBER },
                xmax: { type: Type.NUMBER }
              },
              required: ["ymin", "xmin", "ymax", "xmax"]
            },
            contextSnippet: { type: Type.STRING }
          },
          required: ["exactText", "boundingBox", "contextSnippet"]
        }
      }
    });

    const visionResult = JSON.parse(visionResponse.text);
    
    // Now get the cropped image using the bounding box
    const croppedImageUrl = await getPageImage(originalFile, analysis.targetPageNumber, visionResult.boundingBox);

    return {
      answer: visionResult.exactText || analysis.textAnswer,
      explanation: analysis.explanation,
      pageNumber: analysis.targetPageNumber,
      pageImage: croppedImageUrl,
      contextSnippet: visionResult.contextSnippet
    };

  } catch (error) {
    console.error("Gemini Vision Error:", error);
    // Fallback to text-only answer if vision fails
    return {
      answer: analysis.textAnswer,
      pageNumber: analysis.targetPageNumber,
      contextSnippet: "Visual extraction failed, showing text-only answer.",
      explanation: analysis.explanation
    };
  }
}
