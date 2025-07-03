export interface ComprehensiveContent {
  filename: string;
  collectionName: string;
  content: string;
  chunkCount: number;
  totalChunks: number;
}

export interface DocumentResult {
  pageContent: string;
  metadata: {
    source?: string;
    collectionName?: string;
    originalFilename?: string;
    chunkCount?: number;
    totalChunks?: number;
    type?: string;
  };
}