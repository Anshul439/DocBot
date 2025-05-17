import dotenv from "dotenv";
dotenv.config();

import path from "path";
import { Worker } from "bullmq";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { CharacterTextSplitter } from "@langchain/textsplitters";
import { QdrantClient } from "@qdrant/js-client-rest";

// Initialize Qdrant client
const qdrantClient = new QdrantClient({
  url: "http://localhost:6333",
});

const worker = new Worker(
  "file-upload-queue",
  async (job) => {
    try {
      console.log("Processing job:", job.data);
      const data = JSON.parse(job.data);

      // Extract filename without extension to use as part of collection name
      const parsedPath = path.parse(data.path);
      const baseFilename = parsedPath.name;

      // Create a unique collection name for this PDF
      // Format: pdf_{timestamp}_{filename}
      const collectionName = `pdf_${Date.now()}_${baseFilename
        .replace(/[^a-zA-Z0-9]/g, "_")
        .substring(0, 40)}`;

      console.log(`Creating new collection: ${collectionName}`);

      // Load the PDF
      const loader = new PDFLoader(data.path);
      const docs = await loader.load();
      console.log(`Loaded ${docs.length} document(s) from PDF`);

      // Create text splitter for better processing
      const textSplitter = new CharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      // Split the documents into chunks
      const splitDocs = await textSplitter.splitDocuments(docs);
      console.log(`Split into ${splitDocs.length} chunks`);

      const apiKey = process.env.GOOGLE_API_KEY as string;

      // Initialize Gemini embeddings
      const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GOOGLE_API_KEY,
        modelName: "models/embedding-001",
      });

      // Check if collection exists, if not create it
      const collections = await qdrantClient.getCollections();
      const collectionExists = collections.collections.some(
        (collection) => collection.name === collectionName
      );

      if (!collectionExists) {
        // Create a new collection for this PDF
        await qdrantClient.createCollection(collectionName, {
          vectors: {
            size: 768, // Size for Gemini embedding model
            distance: "Cosine",
          },
        });
        console.log(`Created new collection: ${collectionName}`);
      }

      // Store metadata about this PDF in a separate collection for tracking
      const metadataCollectionName = "pdf_metadata";

      // Check if metadata collection exists
      const metadataCollectionExists = collections.collections.some(
        (collection) => collection.name === metadataCollectionName
      );

      if (!metadataCollectionExists) {
        // Create metadata collection if it doesn't exist
        await qdrantClient.createCollection(metadataCollectionName, {
          vectors: {
            size: 1, // Minimal vector size as we just need to store metadata
            distance: "Dot",
          },
        });
      }

      const metadataPointId = Date.now(); // or use a UUID generator

      // Add metadata about this PDF
      await qdrantClient.upsert(metadataCollectionName, {
        points: [
          {
            id: metadataPointId,
            vector: [1.0], // Dummy vector
            payload: {
              originalFilename: data.filename,
              collectionName: collectionName,
              uploadTime: new Date().toISOString(),
              chunks: splitDocs.length,
            },
          },
        ],
      });

      // Connect to Qdrant vector store with new collection
      const vectorStore = await QdrantVectorStore.fromExistingCollection(
        embeddings,
        {
          url: "http://localhost:6333",
          collectionName: collectionName,
        }
      );

      // Add documents to vector store
      await vectorStore.addDocuments(splitDocs);
      console.log(
        `Successfully added ${splitDocs.length} chunks to collection: ${collectionName}`
      );

      return { collectionName, chunks: splitDocs.length };
    } catch (error) {
      console.error("Error processing PDF:", error);
      throw error;
    }
  },
  {
    concurrency: 5, // Limit concurrency to avoid overwhelming resources
    connection: {
      host: "localhost",
      port: "6379",
    },
  }
);

// Proper error handling for the worker
worker.on("error", (err) => {
  console.error("Worker error:", err);
});

worker.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
});

worker.on("completed", (job, result) => {
  console.log(`Job ${job.id} completed:`, result);
});

console.log("Worker started and listening for jobs...");
