"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const multer_1 = __importDefault(require("multer"));
const bullmq_1 = require("bullmq");
const qdrant_1 = require("@langchain/qdrant");
const google_genai_1 = require("@langchain/google-genai");
const generative_ai_1 = require("@google/generative-ai");
const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const queue = new bullmq_1.Queue("file-upload-queue", {
    connection: { host: "localhost", port: "6379" },
});
const storage = multer_1.default.diskStorage({
    destination: function (req, file, cb) {
        cb(null, "uploads/");
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, `${uniqueSuffix}-${file.originalname}`);
    },
});
//   const upload = multer({ storage: storage })
const upload = (0, multer_1.default)({ storage: storage });
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.get("/", (req, res) => {
    res.json({ status: "fine" });
});
app.post("/upload/pdf", upload.single("pdf"), (req, res) => {
    var _a, _b, _c;
    queue.add("file", JSON.stringify({
        filename: (_a = req.file) === null || _a === void 0 ? void 0 : _a.originalname,
        destination: (_b = req.file) === null || _b === void 0 ? void 0 : _b.destination,
        path: (_c = req.file) === null || _c === void 0 ? void 0 : _c.path,
    }));
    res.json({ message: "uploaded" });
});
const embeddings = new google_genai_1.GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY, // Make sure to set this environment variable
    modelName: "models/embedding-001", // Gemini embedding model
});
app.get("/chat", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Get the query from request parameters instead of hardcoding
        const userQuery = req.query.message;
        if (!userQuery) {
            return res.status(400).json({ error: "Query parameter 'q' is required" });
        }
        // Connect to the vector store
        const vectorStore = yield qdrant_1.QdrantVectorStore.fromExistingCollection(embeddings, {
            url: "http://localhost:6333",
            collectionName: "langchainjs-testing",
        });
        // Retrieve relevant documents
        const retriever = vectorStore.asRetriever({
            k: 3, // Increase to get more context
        });
        const results = yield retriever.invoke(userQuery);
        // Process the retrieved documents to ensure they have proper structure
        const formattedDocs = results.map(doc => ({
            content: doc.pageContent || doc.content || "",
            metadata: doc.metadata || {}
        }));
        console.log("Retrieved documents:", JSON.stringify(formattedDocs, null, 2));
        // Create a better system prompt with proper context formatting
        const contextText = formattedDocs
            .map((doc, i) => `Document ${i + 1}:\n${doc.content}\n`)
            .join("\n");
        const SYSTEM_PROMPT = `You are a helpful AI Assistant who answers user queries based on the available context from PDF files.
    
USER QUERY: ${userQuery}

CONTEXT FROM DOCUMENTS:
${contextText}

Answer the user's query based only on the information in the above context. If the context doesn't contain relevant information to answer the query, acknowledge that and provide a general response.`;
        // Generate response using Gemini
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });
        const geminiResponse = yield model.generateContent(SYSTEM_PROMPT);
        const responseText = geminiResponse.response.text();
        return res.json({
            message: responseText,
            documents: formattedDocs,
        });
    }
    catch (error) {
        console.error("Error processing chat request:", error);
        return res.status(500).json({ error: "An error occurred while processing your request" });
    }
}));
app.listen(8000, () => console.log(`Server started on PORT: ${8000}`));
