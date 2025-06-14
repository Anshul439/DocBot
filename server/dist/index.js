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
const path_1 = __importDefault(require("path"));
const bullmq_1 = require("bullmq");
const qdrant_1 = require("@langchain/qdrant");
const google_genai_1 = require("@langchain/google-genai");
const generative_ai_1 = require("@google/generative-ai");
const js_client_rest_1 = require("@qdrant/js-client-rest");
const pdf_1 = require("@langchain/community/document_loaders/fs/pdf");
const textsplitters_1 = require("@langchain/textsplitters");
const user_route_js_1 = __importDefault(require("./routes/user.route.js"));
const fs_1 = __importDefault(require("fs"));
const mongoose_1 = __importDefault(require("mongoose"));
const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
// Initialize Qdrant client
const qdrantClient = new js_client_rest_1.QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
});
// In-memory storage for current session PDFs
let sessionPDFs = [];
let sessionCollections = new Set();
const queue = new bullmq_1.Queue("file-upload-queue", {
    connection: {
        username: "default",
        password: process.env.REDIS_PASSWORD,
        host: process.env.REDIS_URL,
        port: 10979,
    },
});
// Function to clean up old collections on server start
const cleanupOldCollections = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        console.log("Cleaning up old PDF collections...");
        const collections = yield qdrantClient.getCollections();
        for (const collection of collections.collections) {
            if (collection.name.startsWith("pdf_") || collection.name === "pdf_metadata") {
                try {
                    yield qdrantClient.deleteCollection(collection.name);
                    console.log(`Deleted old collection: ${collection.name}`);
                }
                catch (error) {
                    console.error(`Error deleting collection ${collection.name}:`, error);
                }
            }
        }
        // Clean up uploads directory
        const uploadsDir = "uploads/";
        if (fs_1.default.existsSync(uploadsDir)) {
            const files = fs_1.default.readdirSync(uploadsDir);
            for (const file of files) {
                try {
                    fs_1.default.unlinkSync(path_1.default.join(uploadsDir, file));
                    console.log(`Deleted old file: ${file}`);
                }
                catch (error) {
                    console.error(`Error deleting file ${file}:`, error);
                }
            }
        }
        console.log("Cleanup completed");
    }
    catch (error) {
        console.error("Error during cleanup:", error);
    }
});
// Initialize the worker within the same process
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
        // Connect to Qdrant vector store with new collection
        const vectorStore = yield qdrant_1.QdrantVectorStore.fromExistingCollection(embeddings, {
            url: process.env.QDRANT_URL,
            apiKey: process.env.QDRANT_API_KEY,
            collectionName: collectionName,
        });
        // Add documents to vector store
        yield vectorStore.addDocuments(splitDocs);
        console.log(`Successfully added ${splitDocs.length} chunks to collection: ${collectionName}`);
        // Add to session storage instead of persistent metadata collection
        const pdfMetadata = {
            pointId: Date.now(),
            originalFilename: data.filename,
            collectionName: collectionName,
            uploadTime: new Date().toISOString(),
            chunks: splitDocs.length,
        };
        sessionPDFs.push(pdfMetadata);
        sessionCollections.add(collectionName);
        console.log(`Successfully added PDF to session: ${collectionName}`);
        return { collectionName, chunks: splitDocs.length };
    }
    catch (error) {
        console.error("Error processing PDF:", error);
        throw error;
    }
}), {
    concurrency: 5, // Limit concurrency to avoid overwhelming resources
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
    console.error(`Job ${job.id} failed:`, err);
});
worker.on("completed", (job, result) => {
    console.log(`Job ${job.id} completed:`, result);
});
const storage = multer_1.default.diskStorage({
    destination: function (req, file, cb) {
        // Create uploads directory if it doesn't exist
        const uploadsDir = "uploads/";
        if (!fs_1.default.existsSync(uploadsDir)) {
            fs_1.default.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
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
        return res
            .status(400)
            .json({ success: false, message: "No file uploaded" });
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
        jobId: job.id,
    });
}));
// Get all available PDFs (now returns session PDFs only)
app.get("/pdfs", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        return res.json({
            success: true,
            pdfs: sessionPDFs,
        });
    }
    catch (error) {
        console.error("Error fetching PDFs:", error);
        return res.status(500).json({
            success: false,
            error: "Failed to fetch PDF list",
        });
    }
}));
// Helper function to detect summary requests
function isSummaryRequest(query) {
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
function getComprehensiveContent(collectionsToSearch, embeddings) {
    return __awaiter(this, void 0, void 0, function* () {
        const allContent = [];
        console.log(`Attempting to get content from ${collectionsToSearch.length} collections`);
        for (const collection of collectionsToSearch) {
            try {
                console.log(`Getting comprehensive content from collection: ${collection}`);
                // First, let's check if the collection actually exists and has data
                let collectionInfo;
                try {
                    collectionInfo = yield qdrantClient.getCollection(collection);
                    console.log(`Collection ${collection} exists with ${collectionInfo.points_count} points`);
                    if (collectionInfo.points_count === 0) {
                        console.log(`Collection ${collection} is empty, skipping`);
                        continue;
                    }
                }
                catch (collectionError) {
                    console.error(`Collection ${collection} doesn't exist:`, collectionError);
                    continue;
                }
                // Get metadata from session storage
                let originalFilename = collection; // Default fallback
                const pdfMetadata = sessionPDFs.find(pdf => pdf.collectionName === collection);
                if (pdfMetadata) {
                    originalFilename = pdfMetadata.originalFilename;
                    console.log(`Found session metadata for ${collection}: ${originalFilename}`);
                }
                // Get content from the collection using scroll (more reliable than similarity search for summaries)
                try {
                    const scrollResponse = yield qdrantClient.scroll(collection, {
                        limit: 15, // Get more chunks for better summary
                        with_payload: true,
                        with_vectors: false,
                    });
                    console.log(`Retrieved ${scrollResponse.points.length} points from ${collection}`);
                    if (scrollResponse.points.length > 0) {
                        const contentChunks = scrollResponse.points
                            .map((point) => {
                            var _a, _b;
                            // Handle different payload structures
                            const content = ((_a = point.payload) === null || _a === void 0 ? void 0 : _a.pageContent) || ((_b = point.payload) === null || _b === void 0 ? void 0 : _b.content) || "";
                            return content;
                        })
                            .filter((content) => content && content.trim().length > 20) // More lenient filter
                            .slice(0, 10); // Take first 10 substantial chunks
                        console.log(`Filtered to ${contentChunks.length} substantial chunks from ${collection}`);
                        if (contentChunks.length > 0) {
                            const combinedContent = contentChunks.join("\n\n");
                            allContent.push({
                                filename: originalFilename,
                                collectionName: collection,
                                content: combinedContent,
                                chunkCount: contentChunks.length,
                                totalChunks: scrollResponse.points.length,
                            });
                            console.log(`Successfully added content from ${collection}: ${combinedContent.length} characters`);
                        }
                        else {
                            console.log(`No substantial content found in ${collection} after filtering`);
                        }
                    }
                    else {
                        console.log(`No points returned from scroll for ${collection}`);
                    }
                }
                catch (scrollError) {
                    console.error(`Error during scroll for collection ${collection}:`, scrollError);
                    // Fallback: try using vector store approach
                    try {
                        console.log(`Trying vector store approach for ${collection}`);
                        const vectorStore = yield qdrant_1.QdrantVectorStore.fromExistingCollection(embeddings, {
                            url: process.env.QDRANT_URL,
                            apiKey: process.env.QDRANT_API_KEY,
                            collectionName: collection,
                        });
                        // Use a generic query to get some content
                        const fallbackResults = yield vectorStore.similaritySearch("content document text", 5);
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
                    }
                    catch (fallbackError) {
                        console.error(`Fallback also failed for ${collection}:`, fallbackError);
                    }
                }
            }
            catch (error) {
                console.error(`Error processing collection ${collection}:`, error);
                // Continue with other collections
            }
        }
        console.log(`Total content retrieved from ${allContent.length} collections`);
        return allContent;
    });
}
// Enhanced chat endpoint with complete functionality
app.get("/chat", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userQuery = req.query.message;
        const collectionName = req.query.collection;
        if (!userQuery) {
            return res.status(400).json({
                error: "Message parameter is required",
                success: false,
            });
        }
        console.log(`Processing query: "${userQuery}" for collection: ${collectionName || "all"}`);
        // Use session collections instead of querying database
        let collectionsToSearch = [];
        if (collectionName) {
            // Check if the requested collection exists in session
            if (sessionCollections.has(collectionName)) {
                collectionsToSearch = [collectionName];
                console.log(`Using specified session collection: ${collectionName}`);
            }
            else {
                return res.json({
                    success: false,
                    error: `The PDF collection "${collectionName}" was not found.`,
                    message: "This PDF may have been deleted or is not accessible.",
                });
            }
        }
        else {
            // Get all session collections
            collectionsToSearch = Array.from(sessionCollections);
            console.log(`Found ${collectionsToSearch.length} session PDF collections: ${collectionsToSearch.join(", ")}`);
            if (collectionsToSearch.length === 0) {
                return res.json({
                    success: false,
                    error: "No PDFs have been uploaded yet",
                    message: "Please upload a PDF before asking questions.",
                });
            }
        }
        const apiKey = process.env.GOOGLE_API_KEY;
        const embeddings = new google_genai_1.GoogleGenerativeAIEmbeddings({
            apiKey,
            modelName: "models/embedding-001",
        });
        // Check if this is a summary request
        const isSummary = isSummaryRequest(userQuery);
        if (isSummary) {
            console.log(`Detected summary request for ${collectionName ? "specific PDF" : "all PDFs"}`);
            // Get comprehensive content for summary
            const comprehensiveContent = yield getComprehensiveContent(collectionsToSearch, embeddings);
            console.log(`Retrieved content from ${comprehensiveContent.length} PDFs for summary`);
            if (comprehensiveContent.length === 0) {
                return res.json({
                    success: false,
                    message: "I couldn't find sufficient content in the uploaded PDFs to create a summary. This might be due to processing issues or empty collections.",
                    documents: [],
                    query: userQuery,
                    debug: {
                        collectionsSearched: collectionsToSearch,
                        contentFound: comprehensiveContent.length,
                    },
                });
            }
            // Create context for summary
            const summaryContext = comprehensiveContent
                .map((pdf) => `
=== ${pdf.filename} ===
Chunks: ${pdf.chunkCount}/${pdf.totalChunks}
Content:
${pdf.content}
        `)
                .join("\n\n");
            const SUMMARY_PROMPT = `
You are an AI assistant that creates comprehensive summaries of PDF documents.
Based on the provided content from ${comprehensiveContent.length} PDF document(s), create a detailed summary.

${comprehensiveContent.length > 1
                ? `For each PDF, provide:
1. Main topics and themes
2. Key findings or important information
3. Any notable conclusions or recommendations

Then provide an overall synthesis of all documents together.`
                : `Provide:
1. Main topics and themes covered in the document
2. Key findings or important information
3. Any notable conclusions or recommendations`}

CONTENT FROM ${comprehensiveContent.length} PDF(s):
${summaryContext}

USER REQUEST: ${userQuery}

Please provide a comprehensive summary:`;
            // Generate summary response
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const geminiResponse = yield model.generateContent(SUMMARY_PROMPT);
            const responseText = geminiResponse.response.text();
            // Format documents for response
            const formattedDocs = comprehensiveContent.map((pdf) => ({
                pageContent: pdf.content.substring(0, 500) + "...", // Truncate for response
                metadata: {
                    source: pdf.filename,
                    collectionName: pdf.collectionName,
                    chunkCount: pdf.chunkCount,
                    totalChunks: pdf.totalChunks,
                    type: "summary_content",
                },
            }));
            return res.json({
                success: true,
                message: responseText,
                documents: formattedDocs,
                query: userQuery,
                summaryMode: true,
                pdfsProcessed: comprehensiveContent.length,
            });
        }
        // REGULAR QUESTION ANSWERING (Non-summary queries)
        console.log("Processing regular question-answering query");
        let allRelevantDocs = [];
        let searchResults = [];
        // Search through each collection
        for (const collection of collectionsToSearch) {
            try {
                console.log(`Searching in collection: ${collection}`);
                // Create vector store for this collection
                const vectorStore = yield qdrant_1.QdrantVectorStore.fromExistingCollection(embeddings, {
                    url: process.env.QDRANT_URL,
                    apiKey: process.env.QDRANT_API_KEY,
                    collectionName: collection,
                });
                // Perform similarity search
                const docs = yield vectorStore.similaritySearch(userQuery, 4); // Get top 4 relevant chunks
                console.log(`Found ${docs.length} relevant documents in ${collection}`);
                if (docs.length > 0) {
                    // Get original filename from session storage
                    let originalFilename = collection;
                    const pdfMetadata = sessionPDFs.find(pdf => pdf.collectionName === collection);
                    if (pdfMetadata) {
                        originalFilename = pdfMetadata.originalFilename;
                    }
                    // Add collection info to documents
                    const docsWithCollection = docs.map((doc) => (Object.assign(Object.assign({}, doc), { metadata: Object.assign(Object.assign({}, doc.metadata), { collectionName: collection, originalFilename: originalFilename }) })));
                    allRelevantDocs.push(...docsWithCollection);
                    searchResults.push({
                        collection,
                        originalFilename,
                        docCount: docs.length,
                    });
                }
            }
            catch (error) {
                console.error(`Error searching in collection ${collection}:`, error);
                // Continue with other collections
            }
        }
        console.log(`Total relevant documents found: ${allRelevantDocs.length}`);
        if (allRelevantDocs.length === 0) {
            return res.json({
                success: true,
                message: "I couldn't find any relevant information in the uploaded PDFs to answer your question. Try rephrasing your question or asking about different topics covered in the documents.",
                documents: [],
                query: userQuery,
                searchResults: searchResults,
            });
        }
        // Prepare context for the AI model
        const context = allRelevantDocs
            .map((doc, index) => {
            const filename = doc.metadata.originalFilename || "Unknown PDF";
            return `[Document ${index + 1} - ${filename}]\n${doc.pageContent}`;
        })
            .join("\n\n");
        // Create prompt for question answering
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
        // Generate response using Gemini
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const geminiResponse = yield model.generateContent(QA_PROMPT);
        const responseText = geminiResponse.response.text();
        // Format response
        return res.json({
            success: true,
            message: responseText,
            documents: allRelevantDocs.map((doc) => ({
                pageContent: doc.pageContent,
                metadata: doc.metadata,
            })),
            query: userQuery,
            searchResults: searchResults,
            totalDocuments: allRelevantDocs.length,
        });
    }
    catch (error) {
        console.error("Error in chat endpoint:", error);
        return res.status(500).json({
            success: false,
            error: "Internal server error",
            message: "Sorry, I encountered an error processing your request.",
            debug: error.message,
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
                error: "Job not found",
            });
        }
        const state = yield job.getState();
        return res.json({
            success: true,
            jobId,
            state,
            progress: job.progress,
        });
    }
    catch (error) {
        console.error("Error getting job status:", error);
        return res.status(500).json({
            success: false,
            error: "Failed to get job status",
        });
    }
}));
// Delete PDF endpoint (now removes from session)
app.delete("/pdf/:collectionName", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { collectionName } = req.params;
        // Remove from session storage
        sessionPDFs = sessionPDFs.filter(pdf => pdf.collectionName !== collectionName);
        sessionCollections.delete(collectionName);
        // Try to delete the collection from Qdrant
        try {
            yield qdrantClient.deleteCollection(collectionName);
            console.log(`Collection ${collectionName} deleted successfully`);
        }
        catch (collectionError) {
            console.error(`Error deleting collection ${collectionName}:`, collectionError);
        }
        return res.json({
            success: true,
            message: `PDF collection ${collectionName} deleted successfully`,
        });
    }
    catch (error) {
        console.error("Error deleting PDF:", error);
        return res.status(500).json({
            success: false,
            error: "Failed to delete PDF",
        });
    }
}));
// Clear all session data endpoint (optional)
app.post("/clear-session", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // Clear session data
        for (const collectionName of sessionCollections) {
            try {
                yield qdrantClient.deleteCollection(collectionName);
                console.log(`Deleted collection: ${collectionName}`);
            }
            catch (error) {
                console.error(`Error deleting collection ${collectionName}:`, error);
            }
        }
        sessionPDFs = [];
        sessionCollections.clear();
        return res.json({
            success: true,
            message: "Session cleared successfully",
        });
    }
    catch (error) {
        console.error("Error clearing session:", error);
        return res.status(500).json({
            success: false,
            error: "Failed to clear session",
        });
    }
}));
const PORT = process.env.PORT || 8000;
mongoose_1.default
    .connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connected"))
    .catch((err) => console.error("MongoDB connection error:", err));
app.use("/api/users", user_route_js_1.default);
// Clean up old collections on server start
cleanupOldCollections().then(() => {
    app.listen(PORT, () => {
        console.log(`Server started on PORT: ${PORT}`);
        console.log("Worker started and listening for jobs...");
        console.log("Session-based PDF storage initialized");
    });
});
