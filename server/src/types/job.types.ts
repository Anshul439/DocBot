export interface PdfUploadJobData {
  userId: string;
  filename: string;
  destination: string;
  path: string;
}

export interface PdfIngestionResult {
  collectionName: string;
  chunks: number;
}
