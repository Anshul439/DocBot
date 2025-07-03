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
exports.queue = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const bullmq_1 = require("bullmq");
const qdrant_1 = require("@langchain/qdrant");
const google_genai_1 = require("@langchain/google-genai");
const js_client_rest_1 = require("@qdrant/js-client-rest");
const pdf_1 = require("@langchain/community/document_loaders/fs/pdf");
const textsplitters_1 = require("@langchain/textsplitters");
const user_route_js_1 = __importDefault(require("./routes/user.route.js"));
const pdf_route_js_1 = __importDefault(require("./routes/pdf.route.js"));
// import { createClient } from "redis";
const fs_1 = __importDefault(require("fs"));
const mongoose_1 = __importDefault(require("mongoose"));
const pdf_model_js_1 = __importDefault(require("./models/pdf.model.js"));
// Initialize Qdrant client
const qdrantClient = new js_client_rest_1.QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
});
exports.queue = new bullmq_1.Queue("file-upload-queue", {
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
const worker = new bullmq_1.Worker("file-upload-queue", (job) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("Processing job:", job.data);
        const data = JSON.parse(job.data);
        const userId = new mongoose_1.default.Types.ObjectId(data.userId);
        let fileExists = false;
        let attempts = 0;
        const maxAttempts = 5;
        while (!fileExists && attempts < maxAttempts) {
            if (fs_1.default.existsSync(data.path)) {
                // Also check if file is not empty and not being written to
                const stats = fs_1.default.statSync(data.path);
                if (stats.size > 0) {
                    // Wait a bit more to ensure file is fully written
                    yield new Promise((resolve) => setTimeout(resolve, 200));
                    // Check size again to ensure it's stable
                    const newStats = fs_1.default.statSync(data.path);
                    if (newStats.size === stats.size) {
                        fileExists = true;
                        console.log(`File verified on attempt ${attempts + 1}: ${data.path} (${stats.size} bytes)`);
                    }
                    else {
                        console.log(`File still being written, attempt ${attempts + 1}`);
                    }
                }
                else {
                    console.log(`File is empty on attempt ${attempts + 1}`);
                }
            }
            else {
                console.log(`File does not exist on attempt ${attempts + 1}: ${data.path}`);
            }
            if (!fileExists) {
                attempts++;
                if (attempts < maxAttempts) {
                    console.log(`Waiting 1 second before retry...`);
                    yield new Promise((resolve) => setTimeout(resolve, 1000));
                }
            }
        }
        if (!fileExists) {
            throw new Error(`File not found after ${maxAttempts} attempts: ${data.path}`);
        }
        // Extract filename without extension to use as part of collection name
        const parsedPath = path_1.default.parse(data.path);
        const baseFilename = parsedPath.name;
        // Create a unique collection name for this PDF
        const collectionName = `pdf_${Date.now()}_${baseFilename
            .replace(/[^a-zA-Z0-9]/g, "_")
            .substring(0, 40)}`;
        console.log(`Creating new collection: ${collectionName}`);
        // Load the PDF with error handling
        let docs;
        try {
            const loader = new pdf_1.PDFLoader(data.path);
            docs = yield loader.load();
            console.log(`Loaded ${docs.length} document(s) from PDF`);
        }
        catch (loadError) {
            console.error(`Error loading PDF: ${loadError}`);
            throw new Error(`Failed to load PDF: ${loadError.message}`);
        }
        if (!docs || docs.length === 0) {
            throw new Error("No content found in PDF");
        }
        // Create text splitter for better processing
        const textSplitter = new textsplitters_1.CharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        // Split the documents into chunks
        const splitDocs = yield textSplitter.splitDocuments(docs);
        console.log(`Split into ${splitDocs.length} chunks`);
        if (splitDocs.length === 0) {
            throw new Error("No chunks created from PDF content");
        }
        // Initialize Gemini embeddings
        const embeddings = new google_genai_1.GoogleGenerativeAIEmbeddings({
            apiKey: process.env.GOOGLE_API_KEY,
            modelName: "models/embedding-001",
        });
        // Check if collection exists, if not create it
        const collections = yield qdrantClient.getCollections();
        const collectionExists = collections.collections.some((collection) => collection.name === collectionName);
        if (!collectionExists) {
            // Create a new collection for this PDF
            yield qdrantClient.createCollection(collectionName, {
                vectors: {
                    size: 768,
                    distance: "Cosine",
                },
            });
            console.log(`Created new collection: ${collectionName}`);
        }
        // Connect to Qdrant vector store with new collection
        const vectorStore = yield qdrant_1.QdrantVectorStore.fromExistingCollection(embeddings, {
            url: process.env.QDRANT_URL,
            apiKey: process.env.QDRANT_API_KEY,
            collectionName: collectionName,
        });
        // Add documents to vector store
        yield vectorStore.addDocuments(splitDocs);
        console.log(`Successfully added ${splitDocs.length} chunks to collection: ${collectionName}`);
        // Save metadata to MongoDB
        const pdfMetadata = new pdf_model_js_1.default({
            userId: userId,
            originalFilename: data.filename,
            collectionName: collectionName,
            uploadTime: new Date(),
            chunks: splitDocs.length,
            filePath: data.path,
        });
        yield pdfMetadata.save();
        console.log(`Successfully saved PDF metadata to MongoDB: ${collectionName}`);
        return { collectionName, chunks: splitDocs.length };
    }
    catch (error) {
        console.error("Error processing PDF:", error);
        // Clean up on error
        if (job.data) {
            try {
                const data = JSON.parse(job.data);
                if (data.path && fs_1.default.existsSync(data.path)) {
                    fs_1.default.unlinkSync(data.path);
                    console.log(`Cleaned up file after processing error: ${data.path}`);
                }
            }
            catch (cleanupError) {
                console.error("Error during cleanup:", cleanupError);
            }
        }
        throw error;
    }
}), {
    concurrency: 5,
    connection: {
        username: "default",
        password: process.env.REDIS_PASSWORD,
        host: process.env.REDIS_URL,
        port: 10979,
    },
});
// Worker event handlers
worker.on("error", (err) => {
    console.error("Worker error:", err);
});
worker.on("failed", (job, err) => {
    if (job) {
        console.error(`Job ${job.id} failed:`, err);
    }
    else {
        console.error("Job failed:", err);
    }
});
worker.on("completed", (job, result) => {
    console.log(`Job ${job.id} completed:`, result);
});
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// app.get("/", (req: Request, res: Response) => {
//   res.json({ status: "ok", message: "PDF Chat API is running" });
// });
const PORT = process.env.PORT || 8000;
mongoose_1.default
    .connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connected"))
    .catch((err) => console.error("MongoDB connection error:", err));
app.use("/api/users", user_route_js_1.default);
app.use("/", pdf_route_js_1.default);
app.listen(PORT, () => {
    console.log(`Server started on PORT: ${PORT}`);
    console.log("Worker started and listening for jobs...");
});
