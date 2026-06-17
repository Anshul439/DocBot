import path from "path";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { CharacterTextSplitter } from "@langchain/textsplitters";
import { QdrantVectorStore } from "@langchain/qdrant";
import PDFMetadata from "../models/pdf.model";
import { qdrantClient } from "../config/qdrant";
import { createEmbeddings } from "../config/gemini";
import {
  CHUNK_SIZE,
  CHUNK_OVERLAP,
  EMBEDDING_BATCH_SIZE,
  VECTOR_SIZE,
} from "../config/rag.constants";
import { PdfIngestionResult, PdfUploadJobData } from "../types/job.types";
import { waitForStableFile } from "../utils/fileVerification";

function buildCollectionName(filePath: string): string {
  const parsedPath = path.parse(filePath);
  const baseFilename = parsedPath.name;
  return `pdf_${Date.now()}_${baseFilename
    .replace(/[^a-zA-Z0-9]/g, "_")
    .substring(0, 40)}`;
}

export async function ingestPdf(
  data: PdfUploadJobData
): Promise<PdfIngestionResult> {
  console.log("Processing job:", data);

  await waitForStableFile(data.path);

  const collectionName = buildCollectionName(data.path);
  console.log(`Creating new collection: ${collectionName}`);

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

  const textSplitter = new CharacterTextSplitter({
    chunkSize: CHUNK_SIZE,
    chunkOverlap: CHUNK_OVERLAP,
  });

  const splitDocs = await textSplitter.splitDocuments(docs);
  console.log(`Split into ${splitDocs.length} chunks`);

  if (splitDocs.length === 0) {
    throw new Error("No chunks created from PDF content");
  }

  const embeddings = createEmbeddings();

  const collections = await qdrantClient.getCollections();
  const collectionExists = collections.collections.some(
    (collection) => collection.name === collectionName
  );

  if (!collectionExists) {
    await qdrantClient.createCollection(collectionName, {
      vectors: {
        size: VECTOR_SIZE,
        distance: "Cosine",
      },
    });
    console.log(`Created new collection: ${collectionName}`);
  }

  const vectorStore = await QdrantVectorStore.fromExistingCollection(
    embeddings,
    {
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
      collectionName,
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
    `Successfully added ${splitDocs.length} chunks to collection: ${collectionName}`
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
  console.log(`Successfully saved PDF metadata to MongoDB: ${collectionName}`);

  return { collectionName, chunks: splitDocs.length };
}
