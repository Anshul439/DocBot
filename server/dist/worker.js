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
Object.defineProperty(exports, "__esModule", { value: true });
const bullmq_1 = require("bullmq");
const google_genai_1 = require("@langchain/google-genai");
const qdrant_1 = require("@langchain/qdrant");
const documents_1 = require("@langchain/core/documents");
const pdf_1 = require("@langchain/community/document_loaders/fs/pdf");
const textsplitters_1 = require("@langchain/textsplitters");
const worker = new bullmq_1.Worker("file-upload-queue", (job) => __awaiter(void 0, void 0, void 0, function* () {
    console.log("Job:", job.data);
    const data = JSON.parse(job.data);
    /*
    Path: data.path
    read the pdf from path,
    chunk the pdf,
    call the gemini embedding model for every chunk,
    store the chunk in qdrant db
    */
    // Load the PDF
    const loader = new pdf_1.PDFLoader(data.path);
    const rawDocs = yield loader.load();
    // Add this right after loading the PDF
    const totalPages = rawDocs.length; // If splitPages=true, this gives total pages
    // The loaded docs will now have metadata including page numbers
    const docs = rawDocs.map((doc) => {
        // Extract page number from content (looking for patterns like "23 \nSection")
        const pageNumberMatch = doc.pageContent.match(/^Version 1\.0 \n(\d+)/);
        const pageNumber = pageNumberMatch ? parseInt(pageNumberMatch[1]) : null;
        return new documents_1.Document({
            pageContent: doc.pageContent,
            metadata: Object.assign(Object.assign({}, doc.metadata), { pageNumber: pageNumber, totalPages: totalPages, source: doc.metadata.source }),
        });
    });
    // When splitting, make sure to preserve metadata
    const textSplitter = new textsplitters_1.CharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
    });
    const splitDocs = yield textSplitter.splitDocuments(docs);
    console.log(`Split into ${splitDocs.length} chunks`);
    // console.log(process.env.GOOGLE_API_KEY);
    console.log("AIzaSyAUYQM-y57OPuiGVkPT-StfNbwh0LeiKR8");
    // Initialize Gemini embeddings
    const embeddings = new google_genai_1.GoogleGenerativeAIEmbeddings({
        apiKey: "AIzaSyAUYQM-y57OPuiGVkPT-StfNbwh0LeiKR8", // Make sure to set this environment variable
        modelName: "models/embedding-001", // Gemini embedding model
    });
    // Connect to Qdrant vector store
    const vectorStore = yield qdrant_1.QdrantVectorStore.fromExistingCollection(embeddings, {
        url: "http://localhost:6333",
        collectionName: "langchainjs-testing",
    });
    // Add documents to vector store
    yield vectorStore.addDocuments(splitDocs);
    console.log("All docs are added to vector store");
}), {
    concurrency: 100,
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
console.log("Worker started and listening for jobs...");
