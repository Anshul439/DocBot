import fs from "fs";
import path from "path";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { QdrantVectorStore } from "@langchain/qdrant";
import PDFMetadata from "../models/pdf.model";
import { qdrantClient } from "../config/qdrant";
import { createEmbeddings } from "../config/gemini";
import {
  CHUNK_SIZE,
  CHUNK_OVERLAP,
  EMBEDDING_BATCH_SIZE,
  VECTOR_SIZE,
  QDRANT_COLLECTION,
} from "../config/rag.constants";
import { PdfIngestionResult, PdfUploadJobData } from "../types/job.types";
import { waitForStableFile } from "../utils/fileVerification";

function buildPdfId(filePath: string): string {
  const parsedPath = path.parse(filePath);
  const baseFilename = parsedPath.name;
  return `pdf_${Date.now()}_${baseFilename
    .replace(/[^a-zA-Z0-9]/g, "_")
    .substring(0, 40)}`;
}

let collectionReady = false;

async function ensureCollection(): Promise<void> {
  if (collectionReady) return;

  const collections = await qdrantClient.getCollections();
  const exists = collections.collections.some(
    (c) => c.name === QDRANT_COLLECTION
  );

  if (!exists) {
    await qdrantClient.createCollection(QDRANT_COLLECTION, {
      vectors: { size: VECTOR_SIZE, distance: "Cosine" },
    });

    await qdrantClient.createPayloadIndex(QDRANT_COLLECTION, {
      field_name: "metadata.pdfId",
      field_schema: "keyword",
    });

    await qdrantClient.createPayloadIndex(QDRANT_COLLECTION, {
      field_name: "metadata.userId",
      field_schema: "keyword",
    });

    console.log(
      `Created global collection "${QDRANT_COLLECTION}" with payload indexes`
    );
  }

  collectionReady = true;
}

export async function ingestPdf(
  data: PdfUploadJobData
): Promise<PdfIngestionResult> {
  console.log("Processing job:", data);

  await waitForStableFile(data.path);

  const collectionName = buildPdfId(data.path);
  console.log(`PDF ID: ${collectionName}`);

  let docs;
  try {
    const loader = new PDFLoader(data.path);
    docs = await loader.load();
    console.log(`Loaded ${docs.length} document(s) from PDF`);
  } catch (loadError) {
    console.error(`Error loading PDF: ${loadError}`);
    throw new Error(`Failed to load PDF: ${(loadError as Error).message}`);
  }

  if (!docs || docs.length === 0) {
    throw new Error("No content found in PDF");
  }

  const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  const splitDocs = await textSplitter.splitDocuments(docs);
  console.log(`Split into ${splitDocs.length} chunks`);

  if (splitDocs.length === 0) {
    throw new Error("No chunks created from PDF content");
  }

  for (const doc of splitDocs) {
    doc.metadata = {
      ...doc.metadata,
      pdfId: collectionName,
      userId: data.userId,
    };
  }

  await ensureCollection();

  const embeddings = createEmbeddings();

  const vectorStore = await QdrantVectorStore.fromExistingCollection(
    embeddings,
    {
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
      collectionName: QDRANT_COLLECTION,
    }
  );

  for (let i = 0; i < splitDocs.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = splitDocs.slice(i, i + EMBEDDING_BATCH_SIZE);
    await vectorStore.addDocuments(batch);
    console.log(
      `Added batch ${Math.floor(i / EMBEDDING_BATCH_SIZE) + 1}/${Math.ceil(splitDocs.length / EMBEDDING_BATCH_SIZE)}`
    );
  }

  console.log(
    `Successfully added ${splitDocs.length} chunks to "${QDRANT_COLLECTION}" with pdfId: ${collectionName}`
  );

  const pdfMetadata = new PDFMetadata({
    userId: data.userId,
    originalFilename: data.filename,
    collectionName,
    uploadTime: new Date(),
    chunks: splitDocs.length,
    filePath: data.path,
  });
  await pdfMetadata.save();
  console.log(`Saved PDF metadata to MongoDB: ${collectionName}`);

  try {
    if (fs.existsSync(data.path)) {
      fs.unlinkSync(data.path);
      console.log(`Deleted local PDF after ingestion: ${data.path}`);
    }
  } catch (cleanupErr) {
    console.error(`Failed to delete local PDF (non-fatal): ${cleanupErr}`);
  }

  return { collectionName, chunks: splitDocs.length };
}
