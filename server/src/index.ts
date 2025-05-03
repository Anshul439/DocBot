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

app.get("/chat", async (req: Request, res: Response) => {
  try {
    // Get the query from request parameters instead of hardcoding
    const userQuery = req.query.message
    
    if (!userQuery) {
      return res.status(400).json({ error: "Query parameter 'q' is required" });
    }
    
    // Connect to the vector store
    const vectorStore = await QdrantVectorStore.fromExistingCollection(
      embeddings,
      {
        url: "http://localhost:6333",
        collectionName: "langchainjs-testing",
      }
    );
    
    // Retrieve relevant documents
    const retriever = vectorStore.asRetriever({ 
      k: 3,  // Increase to get more context
    });
    
    const results = await retriever.invoke(userQuery);
    
    // Process the retrieved documents to ensure they have proper structure
    const formattedDocs = results.map(doc => ({
      content: doc.pageContent || doc.content || "",
      metadata: doc.metadata || {}
    }));
    
    console.log("Retrieved documents:", JSON.stringify(formattedDocs, null, 2));
    
    // Create a better system prompt with proper context formatting
    const contextText = formattedDocs
      .map((doc, i) => `Document ${i+1}:\n${doc.content}\n`)
      .join("\n");
    
    const SYSTEM_PROMPT = `You are a helpful AI Assistant who answers user queries based on the available context from PDF files.
    
USER QUERY: ${userQuery}

CONTEXT FROM DOCUMENTS:
${contextText}

Answer the user's query based only on the information in the above context. If the context doesn't contain relevant information to answer the query, acknowledge that and provide a general response.`;

    // Generate response using Gemini
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
    const geminiResponse = await model.generateContent(SYSTEM_PROMPT);
    const responseText = geminiResponse.response.text();
    
    return res.json({
      message: responseText,
      documents: formattedDocs,
    });
  } catch (error) {
    console.error("Error processing chat request:", error);
    return res.status(500).json({ error: "An error occurred while processing your request" });
  }
});

app.listen(8000, () => console.log(`Server started on PORT: ${8000}`));
