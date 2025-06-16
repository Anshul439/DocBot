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
import { createClient } from "redis";
import fs from "fs";
import mongoose from "mongoose";
import PDFMetadata from "./models/pdf.model.js";
import ChatMessage from "./models/chat.model";
import { clerkAuth } from "./middlewares/clerk.middleware.js";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Initialize Qdrant client
const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

// In-memory storage for current session PDFs
let sessionPDFs: any[] = [];
let sessionCollections: Set<string> = new Set();

const queue = new Queue("file-upload-queue", {
  connection: {
    username: "default",
    password: process.env.REDIS_PASSWORD,
    host: process.env.REDIS_URL,
    port: 10979,
  },
});

// Function to clean up old collections on server start
const cleanupOldCollections = async () => {
  try {
    console.log("Cleaning up old PDF collections...");
    const collections = await qdrantClient.getCollections();

    for (const collection of collections.collections) {
      if (
        collection.name.startsWith("pdf_") ||
        collection.name === "pdf_metadata"
      ) {
        try {
          await qdrantClient.deleteCollection(collection.name);
          console.log(`Deleted old collection: ${collection.name}`);
        } catch (error) {
          console.error(`Error deleting collection ${collection.name}:`, error);
        }
      }
    }

    // Clean up uploads directory
    const uploadsDir = "uploads/";
    if (fs.existsSync(uploadsDir)) {
      const files = fs.readdirSync(uploadsDir);
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(uploadsDir, file));
          console.log(`Deleted old file: ${file}`);
        } catch (error) {
          console.error(`Error deleting file ${file}:`, error);
        }
      }
    }

    console.log("Cleanup completed");
  } catch (error) {
    console.error("Error during cleanup:", error);
  }
};

// Initialize the worker within the same process
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
      await vectorStore.addDocuments(splitDocs);
      console.log(
        `Successfully added ${splitDocs.length} chunks to collection: ${collectionName}`
      );

      const pdfMetadata = new PDFMetadata({
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
      throw error;
    }
  },
  {
    concurrency: 5, // Limit concurrency to avoid overwhelming resources
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

worker.on("failed", (job, err) => {
  console.error(`Job ${job.id} failed:`, err);
});

worker.on("completed", (job, result) => {
  console.log(`Job ${job.id} completed:`, result);
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Create uploads directory if it doesn't exist
    const uploadsDir = "uploads/";
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

const upload = multer({ storage: storage });

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req: Request, res: Response) => {
  res.json({ status: "ok", message: "PDF Chat API is running" });
});

// Upload endpoint
app.post(
  "/upload/pdf",
  upload.single("pdf"),
  async (req: Request, res: Response) => {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    // Add to queue for processing
    const job = await queue.add(
      "file",
      JSON.stringify({
        filename: req.file.originalname,
        destination: req.file.destination,
        path: req.file.path,
      })
    );

    res.json({
      success: true,
      message: "PDF uploaded and being processed",
      jobId: job.id,
    });
  }
);

// Get all available PDFs (now returns session PDFs only)
app.get("/pdfs", async (req: Request, res: Response) => {
  try {
    const pdfs = await PDFMetadata.find().sort({ uploadTime: -1 });
    return res.json({
      success: true,
      pdfs: pdfs,
    });
  } catch (error) {
    console.error("Error fetching PDFs:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch PDF list",
    });
  }
});

// Helper function to detect summary requests
function isSummaryRequest(query: string): boolean {
  const summaryKeywords = [
    "summarize",
    "summary",
    "overview",
    "brief",
    "outline",
    "recap",
    "main points",
    "key points",
    "highlights",
    "conclusion",
    "conclusions",
    "what are the main",
    "give me an overview",
    "tell me about all",
    "what do these pdfs contain",
    "content of all pdfs",
  ];

  const lowercaseQuery = query.toLowerCase();
  return summaryKeywords.some((keyword) => lowercaseQuery.includes(keyword));
}

// Fixed helper function to get comprehensive content for summaries
async function getComprehensiveContent(collectionsToSearch, embeddings) {
  const allContent = [];

  console.log(
    `Attempting to get content from ${collectionsToSearch.length} collections`
  );

  for (const collection of collectionsToSearch) {
    try {
      console.log(
        `Getting comprehensive content from collection: ${collection}`
      );

      // First, let's check if the collection actually exists and has data
      let collectionInfo;
      try {
        collectionInfo = await qdrantClient.getCollection(collection);
        console.log(
          `Collection ${collection} exists with ${collectionInfo.points_count} points`
        );

        if (collectionInfo.points_count === 0) {
          console.log(`Collection ${collection} is empty, skipping`);
          continue;
        }
      } catch (collectionError) {
        console.error(
          `Collection ${collection} doesn't exist:`,
          collectionError
        );
        continue;
      }

      // Get metadata from session storage
      let originalFilename = collection; // Default fallback
      const pdfMetadata = sessionPDFs.find(
        (pdf) => pdf.collectionName === collection
      );
      if (pdfMetadata) {
        originalFilename = pdfMetadata.originalFilename;
        console.log(
          `Found session metadata for ${collection}: ${originalFilename}`
        );
      }

      // Get content from the collection using scroll (more reliable than similarity search for summaries)
      try {
        const scrollResponse = await qdrantClient.scroll(collection, {
          limit: 15, // Get more chunks for better summary
          with_payload: true,
          with_vectors: false,
        });

        console.log(
          `Retrieved ${scrollResponse.points.length} points from ${collection}`
        );

        if (scrollResponse.points.length > 0) {
          const contentChunks = scrollResponse.points
            .map((point) => {
              // Handle different payload structures
              const content =
                point.payload?.pageContent || point.payload?.content || "";
              return content;
            })
            .filter((content) => content && content.trim().length > 20) // More lenient filter
            .slice(0, 10); // Take first 10 substantial chunks

          console.log(
            `Filtered to ${contentChunks.length} substantial chunks from ${collection}`
          );

          if (contentChunks.length > 0) {
            const combinedContent = contentChunks.join("\n\n");
            allContent.push({
              filename: originalFilename,
              collectionName: collection,
              content: combinedContent,
              chunkCount: contentChunks.length,
              totalChunks: scrollResponse.points.length,
            });

            console.log(
              `Successfully added content from ${collection}: ${combinedContent.length} characters`
            );
          } else {
            console.log(
              `No substantial content found in ${collection} after filtering`
            );
          }
        } else {
          console.log(`No points returned from scroll for ${collection}`);
        }
      } catch (scrollError) {
        console.error(
          `Error during scroll for collection ${collection}:`,
          scrollError
        );

        // Fallback: try using vector store approach
        try {
          console.log(`Trying vector store approach for ${collection}`);
          const vectorStore = await QdrantVectorStore.fromExistingCollection(
            embeddings,
            {
              url: process.env.QDRANT_URL,
              apiKey: process.env.QDRANT_API_KEY,
              collectionName: collection,
            }
          );

          // Use a generic query to get some content
          const fallbackResults = await vectorStore.similaritySearch(
            "content document text",
            5
          );

          if (fallbackResults.length > 0) {
            const contentChunks = fallbackResults
              .map((doc) => doc.pageContent)
              .filter((content) => content && content.trim().length > 20);

            if (contentChunks.length > 0) {
              allContent.push({
                filename: originalFilename,
                collectionName: collection,
                content: contentChunks.join("\n\n"),
                chunkCount: contentChunks.length,
                totalChunks: fallbackResults.length,
              });

              console.log(`Fallback successful for ${collection}`);
            }
          }
        } catch (fallbackError) {
          console.error(
            `Fallback also failed for ${collection}:`,
            fallbackError
          );
        }
      }
    } catch (error) {
      console.error(`Error processing collection ${collection}:`, error);
      // Continue with other collections
    }
  }

  console.log(`Total content retrieved from ${allContent.length} collections`);
  return allContent;
}

// Enhanced chat endpoint with complete functionality
app.get("/chat", clerkAuth, async (req, res) => {
  try {
    const userQuery = req.query.message;
    const collectionName = req.query.collection;
    const userId = req.auth.userId;

    if (!userQuery) {
      return res.status(400).json({
        error: "Message parameter is required",
        success: false,
      });
    }

    // Save user message to history
    try {
      await ChatMessage.create({
        userId: userId,
        collectionName: collectionName || null,
        role: "user",
        content: userQuery,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Error saving user message:", error);
    }

    console.log(
      `Processing query: "${userQuery}" for collection: ${
        collectionName || "all"
      }`
    );

    let collectionsToSearch = [];
    if (collectionName) {
      const pdf = await PDFMetadata.findOne({ collectionName });
      if (!pdf) {
        return res.json({
          success: false,
          error: `The PDF collection "${collectionName}" was not found.`,
          message: "This PDF may have been deleted or is not accessible.",
        });
      }
      collectionsToSearch = [collectionName];
    } else {
      const allPDFs = await PDFMetadata.find();
      collectionsToSearch = allPDFs.map((pdf) => pdf.collectionName);

      if (collectionsToSearch.length === 0) {
        return res.json({
          success: false,
          error: "No PDFs have been uploaded yet",
          message: "Please upload a PDF before asking questions.",
        });
      }
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey,
      modelName: "models/embedding-001",
    });

    const isSummary = isSummaryRequest(userQuery);
    let responseText = "";
    let documents = [];
    let isSummaryResponse = false;

    if (isSummary) {
      console.log(`Detected summary request`);
      isSummaryResponse = true;
      
      const comprehensiveContent = await getComprehensiveContent(
        collectionsToSearch,
        embeddings
      );

      if (comprehensiveContent.length === 0) {
        responseText = "I couldn't find sufficient content in the uploaded PDFs to create a summary.";
        documents = [];
      } else {
        const summaryContext = comprehensiveContent
          .map(
            (pdf) => `
=== ${pdf.filename} ===
Chunks: ${pdf.chunkCount}/${pdf.totalChunks}
Content:
${pdf.content}
        `
          )
          .join("\n\n");

        const SUMMARY_PROMPT = `
You are an AI assistant that creates comprehensive summaries of PDF documents.
Based on the provided content from ${
          comprehensiveContent.length
        } PDF document(s), create a detailed summary.

${
  comprehensiveContent.length > 1
    ? `For each PDF, provide:
1. Main topics and themes
2. Key findings or important information
3. Any notable conclusions or recommendations

Then provide an overall synthesis of all documents together.`
    : `Provide:
1. Main topics and themes covered in the document
2. Key findings or important information
3. Any notable conclusions or recommendations`
}

CONTENT FROM ${comprehensiveContent.length} PDF(s):
${summaryContext}

USER REQUEST: ${userQuery}

Please provide a comprehensive summary:`;

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const geminiResponse = await model.generateContent(SUMMARY_PROMPT);
        responseText = geminiResponse.response.text();

        documents = comprehensiveContent.map((pdf) => ({
          pageContent: pdf.content.substring(0, 500) + "...",
          metadata: {
            source: pdf.filename,
            collectionName: pdf.collectionName,
            chunkCount: pdf.chunkCount,
            totalChunks: pdf.totalChunks,
            type: "summary_content",
          },
        }));
      }
    } else {
      // Regular question answering
      let allRelevantDocs = [];
      let searchResults = [];

      for (const collection of collectionsToSearch) {
        try {
          const vectorStore = await QdrantVectorStore.fromExistingCollection(
            embeddings,
            {
              url: process.env.QDRANT_URL,
              apiKey: process.env.QDRANT_API_KEY,
              collectionName: collection,
            }
          );

          const docs = await vectorStore.similaritySearch(userQuery, 4);
          if (docs.length > 0) {
            let originalFilename = collection;
            const pdfMetadata = sessionPDFs.find(
              (pdf) => pdf.collectionName === collection
            );
            if (pdfMetadata) {
              originalFilename = pdfMetadata.originalFilename;
            }

            const docsWithCollection = docs.map((doc) => ({
              ...doc,
              metadata: {
                ...doc.metadata,
                collectionName: collection,
                originalFilename: originalFilename,
              },
            }));

            allRelevantDocs.push(...docsWithCollection);
            searchResults.push({
              collection,
              originalFilename,
              docCount: docs.length,
            });
          }
        } catch (error) {
          console.error(`Error searching in collection ${collection}:`, error);
        }
      }

      if (allRelevantDocs.length === 0) {
        responseText = "I couldn't find any relevant information in the uploaded PDFs to answer your question.";
        documents = [];
      } else {
        const context = allRelevantDocs
          .map((doc, index) => {
            const filename = doc.metadata.originalFilename || "Unknown PDF";
            return `[Document ${index + 1} - ${filename}]\n${doc.pageContent}`;
          })
          .join("\n\n");

        const QA_PROMPT = `
You are an AI assistant that answers questions based on PDF documents. 
Use the provided context from PDF documents to answer the user's question accurately and comprehensively.

Important guidelines:
- Only use information from the provided context
- NEVER mention "the document states" or "Based on the provided text" or similar - just answer directly
- If the context doesn't contain enough information to answer the question, say so
- When referencing information, mention which document it came from when possible
- Be specific and detailed in your answers
- If multiple documents contain related information, synthesize it coherently

CONTEXT FROM PDF DOCUMENTS:
${context}

USER QUESTION: ${userQuery}

Please provide a detailed answer based on the information in the documents:`;

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const geminiResponse = await model.generateContent(QA_PROMPT);
        responseText = geminiResponse.response.text();
        documents = allRelevantDocs.map((doc) => ({
          pageContent: doc.pageContent,
          metadata: doc.metadata,
        }));
      }
    }

    // Save assistant response to history
    try {
      await ChatMessage.create({
        userId: userId,
        collectionName: collectionName || null,
        role: "assistant",
        content: responseText,
        documents: documents,
        isSummary: isSummaryResponse,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Error saving assistant message:", error);
    }

    return res.json({
      success: true,
      message: responseText,
      documents: documents,
      query: userQuery,
      isSummary: isSummaryResponse,
    });
  } catch (error) {
    console.error("Error in chat endpoint:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Sorry, I encountered an error processing your request.",
    });
  }
});

// Get job status endpoint
app.get("/job/:id", async (req: Request, res: Response) => {
  try {
    const jobId = req.params.id;
    const job = await queue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: "Job not found",
      });
    }

    const state = await job.getState();

    return res.json({
      success: true,
      jobId,
      state,
      progress: job.progress,
    });
  } catch (error) {
    console.error("Error getting job status:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to get job status",
    });
  }
});

// Delete PDF endpoint
app.delete("/pdf/:collectionName", async (req: Request, res: Response) => {
  try {
    const { collectionName } = req.params;

    // Find and delete from MongoDB
    const deletedPDF = await PDFMetadata.findOneAndDelete({ collectionName });

    if (!deletedPDF) {
      return res.status(404).json({
        success: false,
        error: "PDF not found",
      });
    }

    // Delete the collection from Qdrant
    try {
      await qdrantClient.deleteCollection(collectionName);
      console.log(`Collection ${collectionName} deleted successfully`);
    } catch (collectionError) {
      console.error(
        `Error deleting collection ${collectionName}:`,
        collectionError
      );
    }

    // Delete the physical file
    try {
      if (deletedPDF.filePath && fs.existsSync(deletedPDF.filePath)) {
        fs.unlinkSync(deletedPDF.filePath);
        console.log(`Deleted file: ${deletedPDF.filePath}`);
      }
    } catch (fileError) {
      console.error(`Error deleting file ${deletedPDF.filePath}:`, fileError);
    }

    // Delete all chat history associated with this specific collection
    try {
      const specificDeleteResult = await ChatMessage.deleteMany({
        collectionName: collectionName,
      });
      console.log(
        `Deleted ${specificDeleteResult.deletedCount} specific chat messages for collection ${collectionName}`
      );
    } catch (specificChatDeleteError) {
      console.error(
        `Error deleting specific chat history for collection ${collectionName}:`,
        specificChatDeleteError
      );
    }

    // Delete all general chat history (where collectionName is null)
    try {
      const generalDeleteResult = await ChatMessage.deleteMany({
        collectionName: null,
      });
      console.log(
        `Deleted ${generalDeleteResult.deletedCount} general chat messages`
      );
    } catch (generalChatDeleteError) {
      console.error(
        `Error deleting general chat history:`,
        generalChatDeleteError
      );
    }

    return res.json({
      success: true,
      message: `PDF ${collectionName}, its specific chat history, and all general chat history deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting PDF:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to delete PDF and related chat history",
    });
  }
});

// Get chat history endpoint
app.get("/chat/history",clerkAuth, async (req: Request, res: Response) => {
  try {
    const { collectionName, limit } = req.query;
     const userId = req.auth.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    const query: any = { userId };
    if (collectionName) {
      query.collectionName = collectionName;
    } else {
      query.collectionName = null; // For "all PDFs" chat
    }

    const messages = await ChatMessage.find(query)
      .sort({ timestamp: 1 })
      .limit(parseInt(limit as string) || 50);

    return res.json({
      success: true,
      messages,
    });
  } catch (error) {
    console.error("Error fetching chat history:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch chat history",
    });
  }
});

const PORT = process.env.PORT || 8000;

mongoose
  .connect(process.env.MONGO_URI!)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.error("MongoDB connection error:", err));

app.use("/api/users", userRoutes);

// Clean up old collections on server start
cleanupOldCollections().then(() => {
  app.listen(PORT, () => {
    console.log(`Server started on PORT: ${PORT}`);
    console.log("Worker started and listening for jobs...");
    console.log("Session-based PDF storage initialized");
  });
});
