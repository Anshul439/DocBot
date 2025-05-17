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
const path_1 = __importDefault(require("path"));
const bullmq_1 = require("bullmq");
const google_genai_1 = require("@langchain/google-genai");
const qdrant_1 = require("@langchain/qdrant");
const pdf_1 = require("@langchain/community/document_loaders/fs/pdf");
const textsplitters_1 = require("@langchain/textsplitters");
const js_client_rest_1 = require("@qdrant/js-client-rest");
// Initialize Qdrant client
const qdrantClient = new js_client_rest_1.QdrantClient({
    url: "http://localhost:6333",
});
const worker = new bullmq_1.Worker("file-upload-queue", (job) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("Processing job:", job.data);
        const data = JSON.parse(job.data);
        // Extract filename without extension to use as part of collection name
        const parsedPath = path_1.default.parse(data.path);
        const baseFilename = parsedPath.name;
        // Create a unique collection name for this PDF
        // Format: pdf_{timestamp}_{filename}
        const collectionName = `pdf_${Date.now()}_${baseFilename
            .replace(/[^a-zA-Z0-9]/g, "_")
            .substring(0, 40)}`;
        console.log(`Creating new collection: ${collectionName}`);
        // Load the PDF
        const loader = new pdf_1.PDFLoader(data.path);
        const docs = yield loader.load();
        console.log(`Loaded ${docs.length} document(s) from PDF`);
        // Create text splitter for better processing
        const textSplitter = new textsplitters_1.CharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });
        // Split the documents into chunks
        const splitDocs = yield textSplitter.splitDocuments(docs);
        console.log(`Split into ${splitDocs.length} chunks`);
        const apiKey = process.env.GOOGLE_API_KEY;
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
                    size: 768, // Size for Gemini embedding model
                    distance: "Cosine",
                },
            });
            console.log(`Created new collection: ${collectionName}`);
        }
        // Store metadata about this PDF in a separate collection for tracking
        const metadataCollectionName = "pdf_metadata";
        // Check if metadata collection exists
        const metadataCollectionExists = collections.collections.some((collection) => collection.name === metadataCollectionName);
        if (!metadataCollectionExists) {
            // Create metadata collection if it doesn't exist
            yield qdrantClient.createCollection(metadataCollectionName, {
                vectors: {
                    size: 1, // Minimal vector size as we just need to store metadata
                    distance: "Dot",
                },
            });
        }
        const metadataPointId = Date.now(); // or use a UUID generator
        // Add metadata about this PDF
        yield qdrantClient.upsert(metadataCollectionName, {
            points: [
                {
                    id: metadataPointId,
                    vector: [1.0], // Dummy vector
                    payload: {
                        originalFilename: data.filename,
                        collectionName: collectionName,
                        uploadTime: new Date().toISOString(),
                        chunks: splitDocs.length,
                    },
                },
            ],
        });
        // Connect to Qdrant vector store with new collection
        const vectorStore = yield qdrant_1.QdrantVectorStore.fromExistingCollection(embeddings, {
            url: "http://localhost:6333",
            collectionName: collectionName,
        });
        // Add documents to vector store
        yield vectorStore.addDocuments(splitDocs);
        console.log(`Successfully added ${splitDocs.length} chunks to collection: ${collectionName}`);
        return { collectionName, chunks: splitDocs.length };
    }
    catch (error) {
        console.error("Error processing PDF:", error);
        throw error;
    }
}), {
    concurrency: 5, // Limit concurrency to avoid overwhelming resources
    connection: {
        host: "localhost",
        port: "6379",
    },
});
// Proper error handling for the worker
worker.on("error", (err) => {
    console.error("Worker error:", err);
});
worker.on("failed", (job, err) => {
    console.error(`Job ${job.id} failed:`, err);
});
worker.on("completed", (job, result) => {
    console.log(`Job ${job.id} completed:`, result);
});
console.log("Worker started and listening for jobs...");
