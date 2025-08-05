import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { Queue, Worker } from "bullmq";
import { QdrantVectorStore } from "@langchain/qdrant";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { QdrantClient } from "@qdrant/js-client-rest";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { CharacterTextSplitter } from "@langchain/textsplitters";
import userRoutes from "./routes/user.route.js";
import pdfRoutes from "./routes/pdf.route.js";
// import { createClient } from "redis";
import fs from "fs";
import mongoose from "mongoose";
import PDFMetadata from "./models/pdf.model.js";
import cron from "node-cron";

// Initialize Qdrant client
const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

export const queue = new Queue("file-upload-queue", {
  connection: {
    username: "default",
    password: process.env.REDIS_PASSWORD,
    host: process.env.REDIS_URL,
    port: 10979,
  },
});

// const cleanupOldCollections = async () => {
//   try {
//     console.log("Cleaning up old PDF collections...");
//     const collections = await qdrantClient.getCollections();

//     for (const collection of collections.collections) {
//       if (
//         collection.name.startsWith("pdf_") ||
//         collection.name === "pdf_metadata"
//       ) {
//         try {
//           await qdrantClient.deleteCollection(collection.name);
//           console.log(`Deleted old collection: ${collection.name}`);
//         } catch (error) {
//           console.error(`Error deleting collection ${collection.name}:`, error);
//         }
//       }
//     }

//     // Clean up uploads directory
//     const uploadsDir = "uploads/";
//     if (fs.existsSync(uploadsDir)) {
//       const files = fs.readdirSync(uploadsDir);
//       for (const file of files) {
//         try {
//           fs.unlinkSync(path.join(uploadsDir, file));
//           console.log(`Deleted old file: ${file}`);
//         } catch (error) {
//           console.error(`Error deleting file ${file}:`, error);
//         }
//       }
//     }

//     console.log("Cleanup completed");
//   } catch (error) {
//     console.error("Error during cleanup:", error);
//   }
// };

// Initialize the worker within the same process
const worker = new Worker(
  "file-upload-queue",
  async (job) => {
    try {
      console.log("Processing job:", job.data);
      const data = job.data;
      const userId = new mongoose.Types.ObjectId(data.userId);
      let fileExists = false;
      let attempts = 0;
      const maxAttempts = 5;

      while (!fileExists && attempts < maxAttempts) {
        if (fs.existsSync(data.path)) {
          // Also check if file is not empty and not being written to
          const stats = fs.statSync(data.path);
          if (stats.size > 0) {
            // Wait a bit more to ensure file is fully written
            await new Promise((resolve) => setTimeout(resolve, 200));

            // Check size again to ensure it's stable
            const newStats = fs.statSync(data.path);
            if (newStats.size === stats.size) {
              fileExists = true;
              console.log(
                `File verified on attempt ${attempts + 1}: ${data.path} (${
                  stats.size
                } bytes)`
              );
            } else {
              console.log(`File still being written, attempt ${attempts + 1}`);
            }
          } else {
            console.log(`File is empty on attempt ${attempts + 1}`);
          }
        } else {
          console.log(
            `File does not exist on attempt ${attempts + 1}: ${data.path}`
          );
        }

        if (!fileExists) {
          attempts++;
          if (attempts < maxAttempts) {
            console.log(`Waiting 1 second before retry...`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }

      if (!fileExists) {
        throw new Error(
          `File not found after ${maxAttempts} attempts: ${data.path}`
        );
      }

      // Extract filename without extension to use as part of collection name
      const parsedPath = path.parse(data.path);
      const baseFilename = parsedPath.name;

      // Create a unique collection name for this PDF
      const collectionName = `pdf_${Date.now()}_${baseFilename
        .replace(/[^a-zA-Z0-9]/g, "_")
        .substring(0, 40)}`;

      console.log(`Creating new collection: ${collectionName}`);

      // Load the PDF with error handling
      let docs;
      try {
        const loader = new PDFLoader(data.path);
        docs = await loader.load();
        console.log(`Loaded ${docs.length} document(s) from PDF`);
      } catch (loadError) {
        console.error(`Error loading PDF: ${loadError}`);
        throw new Error(`Failed to load PDF: ${(loadError as any).message}`);
      }

      if (!docs || docs.length === 0) {
        throw new Error("No content found in PDF");
      }

      // Create text splitter for better processing
      const textSplitter = new CharacterTextSplitter({
        chunkSize: 500,
        chunkOverlap: 100,
      });

      // Split the documents into chunks
      const splitDocs = await textSplitter.splitDocuments(docs);
      console.log(`Split into ${splitDocs.length} chunks`);

      if (splitDocs.length === 0) {
        throw new Error("No chunks created from PDF content");
      }

      // Initialize Gemini embeddings
      const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GOOGLE_API_KEY,
        modelName: "models/embedding-001",
      });

      // Check if collection exists, if not create it
      const collections = await qdrantClient.getCollections();
      const collectionExists = collections.collections.some(
        (collection: any) => collection.name === collectionName
      );

      if (!collectionExists) {
        // Create a new collection for this PDF
        await qdrantClient.createCollection(collectionName, {
          vectors: {
            size: 768,
            distance: "Cosine",
          },
        });
        console.log(`Created new collection: ${collectionName}`);
      }

      // Connect to Qdrant vector store with new collection
      const vectorStore = await QdrantVectorStore.fromExistingCollection(
        embeddings,
        {
          url: process.env.QDRANT_URL,
          apiKey: process.env.QDRANT_API_KEY,
          collectionName: collectionName,
        }
      );

      // Add documents to vector store
      const BATCH_SIZE = 40;
      const batches = [];
      for (let i = 0; i < splitDocs.length; i += BATCH_SIZE) {
        batches.push(splitDocs.slice(i, i + BATCH_SIZE));
      }

      for (let i = 0; i < batches.length; i++) {
        await vectorStore.addDocuments(batches[i]);
        console.log(`Added batch ${i + 1}/${batches.length}`);
      }
      console.log(
        `Successfully added ${splitDocs.length} chunks to collection: ${collectionName}`
      );

      // Save metadata to MongoDB
      const pdfMetadata = new PDFMetadata({
        userId: userId,
        originalFilename: data.filename,
        collectionName: collectionName,
        uploadTime: new Date(),
        chunks: splitDocs.length,
        filePath: data.path,
      });
      await pdfMetadata.save();
      console.log(
        `Successfully saved PDF metadata to MongoDB: ${collectionName}`
      );

      return { collectionName, chunks: splitDocs.length };
    } catch (error) {
      console.error("Error processing PDF:", error);

      // Clean up on error
      if (job.data) {
        try {
          const data = job.data;
          if (data.path && fs.existsSync(data.path)) {
            fs.unlinkSync(data.path);
            console.log(`Cleaned up file after processing error: ${data.path}`);
          }
        } catch (cleanupError) {
          console.error("Error during cleanup:", cleanupError);
        }
      }

      throw error;
    }
  },
  {
    concurrency: 5,
    connection: {
      username: "default",
      password: process.env.REDIS_PASSWORD,
      host: process.env.REDIS_URL,
      port: 10979,
    },
  }
);

// Worker event handlers
worker.on("error", (err) => {
  console.error("Worker error:", err);
});

worker.on("failed", (job, err, prev) => {
  console.error(
    `Worker failed processing job ${job?.id} with error: ${err.message}`
  );
});

worker.on("completed", (job, result) => {
  console.log(`Job ${job.id} completed:`, result);
});

const app = express();
app.use(cors());
app.use(express.json());

// app.get("/", (req: Request, res: Response) => {
//   res.json({ status: "ok", message: "PDF Chat API is running" });
// });

app.get("/health", (req: Request, res: Response) => {
  res.json({
    status: "ok",
    message: "Server is alive",
    timestamp: new Date().toISOString(),
  });
});

// Keep-alive function
const keepAlive = async () => {
  try {
    const url = process.env.RENDER_URL;
    const response = await fetch(`${url}/health`);

    if (response.ok) {
      console.log(`Keep-alive ping successful at ${new Date().toISOString()}`);
    } else {
      console.log(`Keep-alive ping failed with status: ${response.status}`);
    }
  } catch (error) {
    console.error("Keep-alive ping error:", error);
  }
};

// Schedule cron job to run every 10 minutes to keep the server alive
cron.schedule("*/14 * * * *", () => {
  console.log("Running keep-alive cron job...");
  keepAlive();
});

const PORT = process.env.PORT || 8000;

mongoose
  .connect(process.env.MONGO_URI!)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.use("/api/users", userRoutes);
app.use("/", pdfRoutes);

app.listen(PORT, () => {
  console.log(`Server started on PORT: ${PORT}`);
  console.log("Worker started and listening for jobs...");
});
