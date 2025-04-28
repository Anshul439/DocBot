import dotenv from "dotenv";
dotenv.config();

import { Worker } from "bullmq";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { Document } from "@langchain/core/documents";
import type { AttributeInfo } from "langchain/chains/query_constructor";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { CharacterTextSplitter } from "@langchain/textsplitters";
import { QdrantClient } from "@qdrant/js-client-rest";

const worker = new Worker(
  "file-upload-queue",
  async (job) => {
    console.log("Job:", job.data);
    const data = JSON.parse(job.data);
    /*
    Path: data.path
    read the pdf from path,
    chunk the pdf,
    call the gemini embedding model for every chunk,
    store the chunk in qdrant db
    */

    // Load the PDF
    const loader = new PDFLoader(data.path);
    const rawDocs = await loader.load();

    // Add this right after loading the PDF
    const totalPages = rawDocs.length; // If splitPages=true, this gives total pages

    // The loaded docs will now have metadata including page numbers
    const docs = rawDocs.map((doc) => {
      // Extract page number from content (looking for patterns like "23 \nSection")
      const pageNumberMatch = doc.pageContent.match(/^Version 1\.0 \n(\d+)/);
      const pageNumber = pageNumberMatch ? parseInt(pageNumberMatch[1]) : null;

      return new Document({
        pageContent: doc.pageContent,
        metadata: {
          ...doc.metadata,
          pageNumber: pageNumber,
          totalPages: totalPages,
          source: doc.metadata.source,
        },
      });
    });

    // When splitting, make sure to preserve metadata
    const textSplitter = new CharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });

    const splitDocs = await textSplitter.splitDocuments(docs);
    console.log(`Split into ${splitDocs.length} chunks`);
    console.log(process.env.GOOGLE_API_KEY);

    // Initialize Gemini embeddings
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey: process.env.GOOGLE_API_KEY, // Make sure to set this environment variable
      modelName: "models/embedding-001", // Gemini embedding model
    });

    // Connect to Qdrant vector store
    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: "http://localhost:6333",
        collectionName: "langchainjs-testing",
      }
    );

    // Add documents to vector store
    await vectorStore.addDocuments(splitDocs);
    console.log("All docs are added to vector store");
  },
  {
    concurrency: 100,
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

console.log("Worker started and listening for jobs...");
