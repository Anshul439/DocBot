// types.ts
export interface IDocumentMetadata {
  source?: string;
  loc?: { pageNumber?: number };
  score?: number;
}

export interface IDocument {
  metadata?: IDocumentMetadata;
  // Add any other document fields your backend might return
  pageContent?: string;
}

export interface IPDF {
  collectionName: string;
  originalFilename: string;
  chunks?: number; // Added based on PDFListComponent usage
  // Add any other PDF fields your backend might return
}

export interface IMessage {
  role: "assistant" | "user";
  content?: string;
  documents?: IDocument[];
  timestamp?: string;
}

export interface FetchPdfsResponse {
  success: boolean;
  pdfs: IPDF[];
  error?: string;
}

export interface FetchChatHistoryResponse {
  success: boolean;
  messages: IMessage[];
  error?: string;
}

export interface ChatResponse {
  success: boolean;
  message: string;
  documents: IDocument[];
  error?: string;
}

export interface JobStatusResponse {
  success: boolean;
  state: 'queued' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export interface UploadResponse {
  success: boolean;
  jobId?: string;
  error?: string;
}

export enum UploadStatus {
  IDLE = "IDLE",
  UPLOADING = "UPLOADING",
  PROCESSING = "PROCESSING",
  SUCCESS = "SUCCESS",
  ERROR = "ERROR"
}