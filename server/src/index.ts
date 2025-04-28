import express, { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import { Queue } from "bullmq";
import { QdrantVectorStore } from "@langchain/qdrant";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

const genAI = new GoogleGenerativeAI("AIzaSyAUYQM-y57OPuiGVkPT-StfNbwh0LeiKR8");

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
  apiKey: "AIzaSyAUYQM-y57OPuiGVkPT-StfNbwh0LeiKR8", // Make sure to set this environment variable
  modelName: "models/embedding-001", // Gemini embedding model
});

app.get("/chat", async (req: Request, res: Response) => {
  const userQuery = "What are the submission guidelines?";
  const vectorStore = await QdrantVectorStore.fromExistingCollection(
    embeddings,
    {
      url: "http://localhost:6333",
      collectionName: "langchainjs-testing",
    }
  );
  const retriever = vectorStore.asRetriever({ k: 2 });

  const result = await retriever.invoke(userQuery);
  console.log(result);
  

  // Extract both content and metadata from the results
  const contextWithMetadata = result.map((doc) => ({
    content: doc.pageContent,
    metadata: doc.metadata, // This includes page numbers etc.
  }));

  const SYSTEM_PROMPT = `You are a helpful AI Assistant who answers the user query based on the available context from PDF file.
  Context:
  ${JSON.stringify(contextWithMetadata)}`;

  const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
  const geminiResponse = await model.generateContent(SYSTEM_PROMPT);
  const responseText = geminiResponse.response.text();
  console.log(responseText);
  

  return res.json({
    message: responseText,
    docs: contextWithMetadata, // Now includes metadata
  });
});

app.listen(8000, () => console.log(`Server started on PORT: ${8000}`));
