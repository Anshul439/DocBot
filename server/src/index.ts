import dotenv from 'dotenv'
dotenv.config()

import express, { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import { Queue } from "bullmq";
import { QdrantVectorStore } from "@langchain/qdrant";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

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

//   const upload = multer({ storage: storage })

const upload = multer({ storage: storage });

const app = express();
app.use(cors());

app.get("/", (req: Request, res: Response) => {
  res.json({ status: "fine" });
});

app.post("/upload/pdf", upload.single("pdf"), (req: Request, res: Response) => {
  queue.add(
    "file",
    JSON.stringify({
      filename: req.file?.originalname,
      destination: req.file?.destination,
      path: req.file?.path,
    })
  );
  res.json({ message: "uploaded" });
});

const embeddings = new GoogleGenerativeAIEmbeddings({
  apiKey: process.env.GOOGLE_API_KEY, // Make sure to set this environment variable
  modelName: "models/embedding-001", // Gemini embedding model
});

// In your server.ts (backend)

app.get("/chat", async (req: Request, res: Response) => {
  try {
    const userQuery = req.query.message as string;
    
    if (!userQuery) {
      return res.status(400).json({ 
        error: "Message parameter is required",
        success: false
      });
    }
    
    // Connect to vector store
    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: "http://localhost:6333",
        collectionName: "langchainjs-testing",
      }
    );
    
    // Retrieve relevant documents with scores
    const results = await vectorStore.similaritySearchWithScore(userQuery, 3);
    
    // Format documents for response
    const formattedDocs = results.map(([doc, score]) => ({
      pageContent: doc.pageContent,
      metadata: {
        ...doc.metadata,
        score, // Include relevance score
        source: doc.metadata?.source || "unknown",
        pageNumber: doc.metadata?.loc?.pageNumber || 1
      }
    }));
    
    // Create context for the AI
    const context = formattedDocs
      .map(doc => `Source: ${doc.metadata.source}\nPage ${doc.metadata.pageNumber}:\n${doc.pageContent}`)
      .join("\n\n---\n\n");
    
    const SYSTEM_PROMPT = `
You are an AI assistant that answers questions based on provided documents.
Use the following context to answer the user's question. If you don't know the answer, say so.

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
      query: userQuery
    });
    
  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Sorry, I encountered an error processing your request."
    });
  }
});

app.listen(8000, () => console.log(`Server started on PORT: ${8000}`));
