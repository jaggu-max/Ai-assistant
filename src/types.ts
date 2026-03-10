export interface PDFPage {
  pageNumber: number;
  text: string;
}

export interface PDFDocument {
  name: string;
  pages: PDFPage[];
  partialFailure?: boolean;
}

export interface QueryResult {
  answer: string;
  pageNumber: number | string;
  contextSnippet: string;
  explanation: string;
  pageImage?: string;
  boundingBox?: {
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
  };
  error?: string;
}

export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  result?: QueryResult;
  createdAt?: any;
}

export interface Chat {
  id: string;
  userId: string;
  pdfName: string;
  createdAt: any;
  lastMessage?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  createdAt: any;
}
