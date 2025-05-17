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
const js_client_rest_1 = require("@qdrant/js-client-rest");
const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
// Initialize Qdrant client
const qdrantClient = new js_client_rest_1.QdrantClient({
    url: "http://localhost:6333"
});
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
const upload = (0, multer_1.default)({ storage: storage });
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get("/", (req, res) => {
    res.json({ status: "ok", message: "PDF Chat API is running" });
});
// Upload endpoint
app.post("/upload/pdf", upload.single("pdf"), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    if (!req.file) {
        return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    // Add to queue for processing
    const job = yield queue.add("file", JSON.stringify({
        filename: req.file.originalname,
        destination: req.file.destination,
        path: req.file.path,
    }));
    res.json({
        success: true,
        message: "PDF uploaded and being processed",
        jobId: job.id
    });
}));
// Get all available PDFs
app.get("/pdfs", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Check if metadata collection exists
        const collections = yield qdrantClient.getCollections();
        const metadataCollectionExists = collections.collections.some(collection => collection.name === "pdf_metadata");
        if (!metadataCollectionExists) {
            return res.json({ success: true, pdfs: [] });
        }
        // Get all PDF metadata
        const response = yield qdrantClient.scroll("pdf_metadata", {
            limit: 100,
            with_payload: true
        });
        const pdfs = response.points.map(point => point.payload);
        return res.json({
            success: true,
            pdfs
        });
    }
    catch (error) {
        console.error("Error fetching PDFs:", error);
        return res.status(500).json({
            success: false,
            error: "Failed to fetch PDF list"
        });
    }
}));
// Chat endpoint
app.get("/chat", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userQuery = req.query.message;
        const collectionName = req.query.collection;
        if (!userQuery) {
            return res.status(400).json({
                error: "Message parameter is required",
                success: false
            });
        }
        // If collection is not specified, query the metadata to get all collections
        let collectionsToSearch = [];
        if (collectionName) {
            // Use the specified collection
            collectionsToSearch = [collectionName];
        }
        else {
            // If no collection specified, get all PDF collections
            const collections = yield qdrantClient.getCollections();
            collectionsToSearch = collections.collections
                .filter(col => col.name.startsWith('pdf_') && col.name !== 'pdf_metadata')
                .map(col => col.name);
            if (collectionsToSearch.length === 0) {
                return res.json({
                    success: false,
                    error: "No PDFs have been uploaded yet",
                    message: "Please upload a PDF before asking questions."
                });
            }
        }
        const apiKey = process.env.GOOGLE_API_KEY;
        const embeddings = new google_genai_1.GoogleGenerativeAIEmbeddings({
            apiKey,
            modelName: "models/embedding-001",
        });
        // Search across all collections and merge results
        let allResults = [];
        for (const collection of collectionsToSearch) {
            try {
                // Connect to vector store
                const vectorStore = yield qdrant_1.QdrantVectorStore.fromExistingCollection(embeddings, {
                    url: "http://localhost:6333",
                    collectionName: collection,
                });
                // Retrieve relevant documents with scores
                const results = yield vectorStore.similaritySearchWithScore(userQuery, 2);
                // Add collection name to metadata
                const resultsWithCollectionInfo = results.map(([doc, score]) => {
                    return [
                        Object.assign(Object.assign({}, doc), { metadata: Object.assign(Object.assign({}, doc.metadata), { collectionName: collection }) }),
                        score
                    ];
                });
                allResults = [...allResults, ...resultsWithCollectionInfo];
            }
            catch (error) {
                console.error(`Error searching collection ${collection}:`, error);
                // Continue with other collections if one fails
            }
        }
        // Sort all results by score and take top 3
        allResults.sort((a, b) => b[1] - a[1]);
        const topResults = allResults.slice(0, 3);
        // Format documents for response
        const formattedDocs = topResults.map(([doc, score]) => {
            var _a, _b, _c, _d;
            return ({
                pageContent: doc.pageContent,
                metadata: Object.assign(Object.assign({}, doc.metadata), { score, source: ((_a = doc.metadata) === null || _a === void 0 ? void 0 : _a.source) || "unknown", pageNumber: ((_c = (_b = doc.metadata) === null || _b === void 0 ? void 0 : _b.loc) === null || _c === void 0 ? void 0 : _c.pageNumber) || 1, collectionName: (_d = doc.metadata) === null || _d === void 0 ? void 0 : _d.collectionName })
            });
        });
        // Create context for the AI
        const context = formattedDocs
            .map(doc => `Source: ${doc.metadata.source}\nPage ${doc.metadata.pageNumber}:\n${doc.pageContent}`)
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
        const geminiResponse = yield model.generateContent(SYSTEM_PROMPT);
        const responseText = geminiResponse.response.text();
        return res.json({
            success: true,
            message: responseText,
            documents: formattedDocs,
            query: userQuery
        });
    }
    catch (error) {
        console.error("Error:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error",
            message: "Sorry, I encountered an error processing your request."
        });
    }
}));
// Get job status endpoint
app.get("/job/:id", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const jobId = req.params.id;
        const job = yield queue.getJob(jobId);
        if (!job) {
            return res.status(404).json({
                success: false,
                error: "Job not found"
            });
        }
        const state = yield job.getState();
        return res.json({
            success: true,
            jobId,
            state,
            progress: job.progress
        });
    }
    catch (error) {
        console.error("Error getting job status:", error);
        return res.status(500).json({
            success: false,
            error: "Failed to get job status"
        });
    }
}));
// Delete PDF endpoint
app.delete("/pdf/:collectionName", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { collectionName } = req.params;
        // Delete the collection
        yield qdrantClient.deleteCollection(collectionName);
        // Remove from metadata
        yield qdrantClient.delete("pdf_metadata", {
            points: [collectionName]
        });
        return res.json({
            success: true,
            message: `PDF collection ${collectionName} deleted successfully`
        });
    }
    catch (error) {
        console.error("Error deleting PDF:", error);
        return res.status(500).json({
            success: false,
            error: "Failed to delete PDF"
        });
    }
}));
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`Server started on PORT: ${PORT}`));
