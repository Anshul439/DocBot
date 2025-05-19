import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import { Queue } from "bullmq";
import { QdrantVectorStore } from "@langchain/qdrant";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { QdrantClient } from "@qdrant/js-client-rest";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Initialize Qdrant client
const qdrantClient = new QdrantClient({
  url: "http://localhost:6333",
});

const queue = new Queue("file-upload-queue", {
  connection: { host: "localhost", port: "6379" },
});

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
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

// Get all available PDFs
app.get("/pdfs", async (req: Request, res: Response) => {
  try {
    // Check if metadata collection exists
    const collections = await qdrantClient.getCollections();
    const metadataCollectionExists = collections.collections.some(
      (collection) => collection.name === "pdf_metadata"
    );

    if (!metadataCollectionExists) {
      return res.json({ success: true, pdfs: [] });
    }

    // Get all PDF metadata
    const response = await qdrantClient.scroll("pdf_metadata", {
      limit: 100,
      with_payload: true,
    });

    const pdfs = response.points.map((point) => point.payload);

    return res.json({
      success: true,
      pdfs,
    });
  } catch (error) {
    console.error("Error fetching PDFs:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch PDF list",
    });
  }
});

// Chat endpoint
// Chat endpoint
app.get("/chat", async (req: Request, res: Response) => {
  try {
    const userQuery = req.query.message as string;
    const collectionName = req.query.collection as string;

    if (!userQuery) {
      return res.status(400).json({
        error: "Message parameter is required",
        success: false,
      });
    }

    // If collection is not specified, query the metadata to get all collections
    let collectionsToSearch: string[] = [];

    if (collectionName) {
      // First check if the requested collection exists
      try {
        const collectionInfo = await qdrantClient.getCollection(collectionName);
        if (collectionInfo) {
          collectionsToSearch = [collectionName];
          console.log(`Using specified collection: ${collectionName}`);
        }
      } catch (err) {
        console.error(`Collection ${collectionName} not found:`, err);
        return res.json({
          success: false,
          error: `The PDF collection "${collectionName}" was not found.`,
          message: "This PDF may have been deleted or is not accessible.",
        });
      }
    } else {
      // If no collection specified, get all PDF collections
      const collections = await qdrantClient.getCollections();
      collectionsToSearch = collections.collections
        .filter(
          (col) => col.name.startsWith("pdf_") && col.name !== "pdf_metadata"
        )
        .map((col) => col.name);

      if (collectionsToSearch.length === 0) {
        return res.json({
          success: false,
          error: "No PDFs have been uploaded yet",
          message: "Please upload a PDF before asking questions.",
        });
      }
    }

    const apiKey = process.env.GOOGLE_API_KEY as string;

    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey,
      modelName: "models/embedding-001",
    });

    // Search across all collections and merge results
    let allResults = [];

    for (const collection of collectionsToSearch) {
      try {
        console.log(`Searching in collection: ${collection}`);

        // Connect to vector store
        const vectorStore = await QdrantVectorStore.fromExistingCollection(
          embeddings,
          {
            url: "http://localhost:6333",
            collectionName: collection,
          }
        );

        // Retrieve relevant documents with scores
        const results = await vectorStore.similaritySearchWithScore(
          userQuery,
          2
        );
        console.log(`Found ${results.length} results in ${collection}`);

        // Add collection name to metadata
        const resultsWithCollectionInfo = results.map(([doc, score]) => {
          return [
            {
              ...doc,
              metadata: {
                ...doc.metadata,
                collectionName: collection,
              },
            },
            score,
          ];
        });

        allResults = [...allResults, ...resultsWithCollectionInfo];
      } catch (error) {
        console.error(`Error searching collection ${collection}:`, error);
        // Continue with other collections if one fails
      }
    }

    // If no results found
    if (allResults.length === 0) {
      return res.json({
        success: true,
        message:
          "I couldn't find information about that in the uploaded PDF(s). Could you please rephrase your question or try a different query?",
        documents: [],
        query: userQuery,
      });
    }

    // Sort all results by score and take top 3
    allResults.sort((a, b) => (b[1] as number) - (a[1] as number));
    const topResults = allResults.slice(0, 3);

    // Format documents for response
    const formattedDocs = topResults.map(([doc, score]) => ({
      pageContent: doc.pageContent,
      metadata: {
        ...doc.metadata,
        score, // Include relevance score
        source: doc.metadata?.source || "unknown",
        pageNumber: doc.metadata?.loc?.pageNumber || 1,
        collectionName: doc.metadata?.collectionName,
      },
    }));

    // Create context for the AI
    const context = formattedDocs
      .map(
        (doc) =>
          `Source: ${doc.metadata.source}\nPage ${doc.metadata.pageNumber}:\n${doc.pageContent}`
      )
      .join("\n\n---\n\n");

    const SYSTEM_PROMPT = `
You are an AI assistant that answers questions based on provided documents.
Use the following context to answer the user's question. If you don't know the answer based on the context, say so clearly.

CONTEXT:
${context}

QUESTION: ${userQuery}

ANSWER:`;

    // Generate response
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const geminiResponse = await model.generateContent(SYSTEM_PROMPT);
    const responseText = geminiResponse.response.text();

    return res.json({
      success: true,
      message: responseText,
      documents: formattedDocs,
      query: userQuery,
    });
  } catch (error) {
    console.error("Error:", error);
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

    // Find the metadata entry for this collection
    const metadataResponse = await qdrantClient.scroll("pdf_metadata", {
      filter: {
        must: [
          {
            key: "collectionName",
            match: {
              value: collectionName,
            },
          },
        ],
      },
      limit: 1,
      with_payload: true,
      with_vectors: false,
    });

    // Try to delete the collection
    try {
      await qdrantClient.deleteCollection(collectionName);
      console.log(`Collection ${collectionName} deleted successfully`);
    } catch (collectionError) {
      console.error(
        `Error deleting collection ${collectionName}:`,
        collectionError
      );
      // Continue anyway to clean up metadata
    }

    // If metadata entry was found, delete it
    if (metadataResponse.points.length > 0) {
      const point = metadataResponse.points[0];
      const pointId = point.id;

      console.log(
        `Deleting metadata point with ID: ${pointId} for collection: ${collectionName}`
      );

      // Remove from metadata using the correct point ID format
      await qdrantClient.delete("pdf_metadata", {
        points: [pointId], // Use the ID directly from the point
      });

      console.log(
        `Metadata for collection ${collectionName} deleted successfully`
      );
    } else {
      console.log(`No metadata found for collection ${collectionName}`);
    }

    return res.json({
      success: true,
      message: `PDF collection ${collectionName} deleted successfully`,
    });
  } catch (error) {
    console.error("Error deleting PDF:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to delete PDF",
    });
  }
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server started on PORT: ${PORT}`));
