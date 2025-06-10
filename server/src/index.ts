import dotenv from "dotenv";
dotenv.config();

import express, { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import { Queue, Worker } from "bullmq";
import { QdrantVectorStore } from "@langchain/qdrant";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { QdrantClient } from "@qdrant/js-client-rest";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { CharacterTextSplitter } from "@langchain/textsplitters";
import { createClient } from "redis";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

// Initialize Qdrant client
const qdrantClient = new QdrantClient({
  url: "https://3d196b01-67bd-48ce-be38-93174a6c7beb.us-west-1-0.aws.cloud.qdrant.io:6333",
  apiKey: "1-epIrmYd_dp5OtFkttML7XYHCc4-uJgVgvrNaPZLNnvLCg7f22hVA",
});

const redisConnection = createClient({
  username: "default",
  password: "t2sldAXuL6SgLCEm7lQcrlzdtnONlCsY",
  socket: {
    host: "redis-10979.c84.us-east-1-2.ec2.redns.redis-cloud.com",
    port: 10979,
  },
});

console.log(process.env.REDIS_URL);

const queue = new Queue("file-upload-queue", {
connection: {
    username: "default",
    password: "t2sldAXuL6SgLCEm7lQcrlzdtnONlCsY",
    host: "redis-10979.c84.us-east-1-2.ec2.redns.redis-cloud.com",
    port: 10979,
  },
});

// Initialize the worker within the same process
const worker = new Worker(
  "file-upload-queue",
  async (job) => {
    try {
      console.log("Processing job:", job.data);
      const data = JSON.parse(job.data);

      // Extract filename without extension to use as part of collection name
      const parsedPath = path.parse(data.path);
      const baseFilename = parsedPath.name;

      // Create a unique collection name for this PDF
      // Format: pdf_{timestamp}_{filename}
      const collectionName = `pdf_${Date.now()}_${baseFilename
        .replace(/[^a-zA-Z0-9]/g, "_")
        .substring(0, 40)}`;

      console.log(`Creating new collection: ${collectionName}`);

      // Load the PDF
      const loader = new PDFLoader(data.path);
      const docs = await loader.load();
      console.log(`Loaded ${docs.length} document(s) from PDF`);

      // Create text splitter for better processing
      const textSplitter = new CharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      // Split the documents into chunks
      const splitDocs = await textSplitter.splitDocuments(docs);
      console.log(`Split into ${splitDocs.length} chunks`);

      const apiKey = process.env.GOOGLE_API_KEY as string;

      // Initialize Gemini embeddings
      const embeddings = new GoogleGenerativeAIEmbeddings({
        apiKey: process.env.GOOGLE_API_KEY,
        modelName: "models/embedding-001",
      });

      // Check if collection exists, if not create it
      const collections = await qdrantClient.getCollections();
      const collectionExists = collections.collections.some(
        (collection) => collection.name === collectionName
      );

      if (!collectionExists) {
        // Create a new collection for this PDF
        await qdrantClient.createCollection(collectionName, {
          vectors: {
            size: 768, // Size for Gemini embedding model
            distance: "Cosine",
          },
        });
        console.log(`Created new collection: ${collectionName}`);
      }

      // Connect to Qdrant vector store with new collection
      const vectorStore = await QdrantVectorStore.fromExistingCollection(
        embeddings,
        {
           url: "https://3d196b01-67bd-48ce-be38-93174a6c7beb.us-west-1-0.aws.cloud.qdrant.io:6333",
          apiKey: "1-epIrmYd_dp5OtFkttML7XYHCc4-uJgVgvrNaPZLNnvLCg7f22hVA",
          collectionName: collectionName,
        }
      );

      // Add documents to vector store
      await vectorStore.addDocuments(splitDocs);
      console.log(
        `Successfully added ${splitDocs.length} chunks to collection: ${collectionName}`
      );

      // Store metadata about this PDF in a separate collection for tracking
      const metadataCollectionName = "pdf_metadata";

      // Check if metadata collection exists
      const metadataCollectionExists = collections.collections.some(
        (collection) => collection.name === metadataCollectionName
      );

      if (!metadataCollectionExists) {
        // Create metadata collection if it doesn't exist
        await qdrantClient.createCollection(metadataCollectionName, {
          vectors: {
            size: 1, // Minimal vector size as we just need to store metadata
            distance: "Dot",
          },
        });
        console.log(`Created metadata collection: ${metadataCollectionName}`);
      }

      // Generate a numeric point ID for Qdrant (requires unsigned int or UUID)
      const metadataPointId = Math.floor(Date.now() / 1000); // Use epoch seconds as integer ID

      console.log(`Adding metadata with point ID: ${metadataPointId}`);

      // Add metadata about this PDF
      await qdrantClient.upsert(metadataCollectionName, {
        points: [
          {
            id: metadataPointId,
            vector: [1.0], // Dummy vector
            payload: {
              pointId: metadataPointId, // Store ID in payload for reference
              originalFilename: data.filename,
              collectionName: collectionName,
              uploadTime: new Date().toISOString(),
              chunks: splitDocs.length,
            },
          },
        ],
      });

      console.log(`Successfully added metadata for ${collectionName}`);

      return { collectionName, chunks: splitDocs.length };
    } catch (error) {
      console.error("Error processing PDF:", error);
      throw error;
    }
  },
  {
    concurrency: 5, // Limit concurrency to avoid overwhelming resources
    connection: {
       username: "default",
      password: "t2sldAXuL6SgLCEm7lQcrlzdtnONlCsY",
      host: "redis-10979.c84.us-east-1-2.ec2.redns.redis-cloud.com",
      port: 10979,
    },
  }
);

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

// Helper function to detect summary requests
function isSummaryRequest(query: string): boolean {
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
async function getComprehensiveContent(collectionsToSearch, embeddings) {
  const allContent = [];
  
  console.log(`Attempting to get content from ${collectionsToSearch.length} collections`);
  
  for (const collection of collectionsToSearch) {
    try {
      console.log(`Getting comprehensive content from collection: ${collection}`);
      
      // First, let's check if the collection actually exists and has data
      let collectionInfo;
      try {
        collectionInfo = await qdrantClient.getCollection(collection);
        console.log(`Collection ${collection} exists with ${collectionInfo.points_count} points`);
        
        if (collectionInfo.points_count === 0) {
          console.log(`Collection ${collection} is empty, skipping`);
          continue;
        }
      } catch (collectionError) {
        console.error(`Collection ${collection} doesn't exist:`, collectionError);
        continue;
      }

      // Get metadata to find the original filename
      let originalFilename = collection; // Default fallback
      
      try {
        const metadataResponse = await qdrantClient.scroll("pdf_metadata", {
          filter: {
            must: [
              {
                key: "collectionName",
                match: {
                  value: collection,
                },
              },
            ],
          },
          limit: 1,
          with_payload: true,
        });
        
        if (metadataResponse.points.length > 0) {
          originalFilename = metadataResponse.points[0].payload.originalFilename || collection;
          console.log(`Found metadata for ${collection}: ${originalFilename}`);
        } else {
          console.log(`No metadata found for ${collection}, using collection name as filename`);
        }
      } catch (metadataError) {
        console.error(`Error fetching metadata for ${collection}:`, metadataError);
        // Continue with default filename
      }

      // Get content from the collection using scroll (more reliable than similarity search for summaries)
      try {
        const scrollResponse = await qdrantClient.scroll(collection, {
          limit: 15, // Get more chunks for better summary
          with_payload: true,
          with_vectors: false,
        });

        console.log(`Retrieved ${scrollResponse.points.length} points from ${collection}`);

        if (scrollResponse.points.length > 0) {
          const contentChunks = scrollResponse.points
            .map(point => {
              // Handle different payload structures
              const content = point.payload?.pageContent || point.payload?.content || '';
              return content;
            })
            .filter(content => content && content.trim().length > 20) // More lenient filter
            .slice(0, 10); // Take first 10 substantial chunks

          console.log(`Filtered to ${contentChunks.length} substantial chunks from ${collection}`);

          if (contentChunks.length > 0) {
            const combinedContent = contentChunks.join('\n\n');
            allContent.push({
              filename: originalFilename,
              collectionName: collection,
              content: combinedContent,
              chunkCount: contentChunks.length,
              totalChunks: scrollResponse.points.length
            });
            
            console.log(`Successfully added content from ${collection}: ${combinedContent.length} characters`);
          } else {
            console.log(`No substantial content found in ${collection} after filtering`);
          }
        } else {
          console.log(`No points returned from scroll for ${collection}`);
        }
      } catch (scrollError) {
        console.error(`Error during scroll for collection ${collection}:`, scrollError);
        
        // Fallback: try using vector store approach
        try {
          console.log(`Trying vector store approach for ${collection}`);
          const vectorStore = await QdrantVectorStore.fromExistingCollection(
            embeddings,
            {
            url: "https://3d196b01-67bd-48ce-be38-93174a6c7beb.us-west-1-0.aws.cloud.qdrant.io:6333",
              apiKey: "1-epIrmYd_dp5OtFkttML7XYHCc4-uJgVgvrNaPZLNnvLCg7f22hVA",
              collectionName: collection,
            }
          );

          // Use a generic query to get some content
          const fallbackResults = await vectorStore.similaritySearch("content document text", 5);
          
          if (fallbackResults.length > 0) {
            const contentChunks = fallbackResults
              .map(doc => doc.pageContent)
              .filter(content => content && content.trim().length > 20);
              
            if (contentChunks.length > 0) {
              allContent.push({
                filename: originalFilename,
                collectionName: collection,
                content: contentChunks.join('\n\n'),
                chunkCount: contentChunks.length,
                totalChunks: fallbackResults.length
              });
              
              console.log(`Fallback successful for ${collection}`);
            }
          }
        } catch (fallbackError) {
          console.error(`Fallback also failed for ${collection}:`, fallbackError);
        }
      }
    } catch (error) {
      console.error(`Error processing collection ${collection}:`, error);
      // Continue with other collections
    }
  }
  
  console.log(`Total content retrieved from ${allContent.length} collections`);
  return allContent;
}

// Enhanced chat endpoint with better error handling and debugging
// Enhanced chat endpoint with complete functionality
app.get("/chat", async (req, res) => {
  try {
    const userQuery = req.query.message;
    const collectionName = req.query.collection;

    if (!userQuery) {
      return res.status(400).json({
        error: "Message parameter is required",
        success: false,
      });
    }

    console.log(`Processing query: "${userQuery}" for collection: ${collectionName || 'all'}`);

    // If collection is not specified, query the metadata to get all collections
    let collectionsToSearch = [];

    if (collectionName) {
      // First check if the requested collection exists
      try {
        const collectionInfo = await qdrantClient.getCollection(collectionName);
        if (collectionInfo) {
          collectionsToSearch = [collectionName];
          console.log(`Using specified collection: ${collectionName} (${collectionInfo.points_count} points)`);
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

      console.log(`Found ${collectionsToSearch.length} PDF collections: ${collectionsToSearch.join(', ')}`);

      if (collectionsToSearch.length === 0) {
        return res.json({
          success: false,
          error: "No PDFs have been uploaded yet",
          message: "Please upload a PDF before asking questions.",
        });
      }
    }

    const apiKey = process.env.GOOGLE_API_KEY;

    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey,
      modelName: "models/embedding-001",
    });

    // Check if this is a summary request
    const isSummary = isSummaryRequest(userQuery);
    
    if (isSummary) {
      console.log(`Detected summary request for ${collectionName ? 'specific PDF' : 'all PDFs'}`);
      
      // Get comprehensive content for summary
      const comprehensiveContent = await getComprehensiveContent(collectionsToSearch, embeddings);
      
      console.log(`Retrieved content from ${comprehensiveContent.length} PDFs for summary`);
      
      if (comprehensiveContent.length === 0) {
        return res.json({
          success: false,
          message: "I couldn't find sufficient content in the uploaded PDFs to create a summary. This might be due to processing issues or empty collections.",
          documents: [],
          query: userQuery,
          debug: {
            collectionsSearched: collectionsToSearch,
            contentFound: comprehensiveContent.length
          }
        });
      }

      // Create context for summary
      const summaryContext = comprehensiveContent
        .map(pdf => `
=== ${pdf.filename} ===
Chunks: ${pdf.chunkCount}/${pdf.totalChunks}
Content:
${pdf.content}
        `)
        .join('\n\n');

      const SUMMARY_PROMPT = `
You are an AI assistant that creates comprehensive summaries of PDF documents.
Based on the provided content from ${comprehensiveContent.length} PDF document(s), create a detailed summary.

${comprehensiveContent.length > 1 ? 
  `For each PDF, provide:
1. Main topics and themes
2. Key findings or important information
3. Any notable conclusions or recommendations

Then provide an overall synthesis of all documents together.` :
  `Provide:
1. Main topics and themes covered in the document
2. Key findings or important information
3. Any notable conclusions or recommendations`
}

CONTENT FROM ${comprehensiveContent.length} PDF(s):
${summaryContext}

USER REQUEST: ${userQuery}

Please provide a comprehensive summary:`;

      // Generate summary response
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const geminiResponse = await model.generateContent(SUMMARY_PROMPT);
      const responseText = geminiResponse.response.text();

      // Format documents for response
      const formattedDocs = comprehensiveContent.map(pdf => ({
        pageContent: pdf.content.substring(0, 500) + "...", // Truncate for response
        metadata: {
          source: pdf.filename,
          collectionName: pdf.collectionName,
          chunkCount: pdf.chunkCount,
          totalChunks: pdf.totalChunks,
          type: "summary_content"
        },
      }));

      return res.json({
        success: true,
        message: responseText,
        documents: formattedDocs,
        query: userQuery,
        summaryMode: true,
        pdfsProcessed: comprehensiveContent.length
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
        const vectorStore = await QdrantVectorStore.fromExistingCollection(
          embeddings,
          {
           url: "https://3d196b01-67bd-48ce-be38-93174a6c7beb.us-west-1-0.aws.cloud.qdrant.io:6333",
            apiKey: "1-epIrmYd_dp5OtFkttML7XYHCc4-uJgVgvrNaPZLNnvLCg7f22hVA",
            collectionName: collection,
          }
        );

        // Perform similarity search
        const docs = await vectorStore.similaritySearch(userQuery, 4); // Get top 4 relevant chunks
        
        console.log(`Found ${docs.length} relevant documents in ${collection}`);
        
        if (docs.length > 0) {
          // Get original filename from metadata
          let originalFilename = collection;
          try {
            const metadataResponse = await qdrantClient.scroll("pdf_metadata", {
              filter: {
                must: [
                  {
                    key: "collectionName",
                    match: {
                      value: collection,
                    },
                  },
                ],
              },
              limit: 1,
              with_payload: true,
            });
            
            if (metadataResponse.points.length > 0) {
              originalFilename = metadataResponse.points[0].payload.originalFilename || collection;
            }
          } catch (metadataError) {
            console.error(`Error fetching metadata for ${collection}:`, metadataError);
          }

          // Add collection info to documents
          const docsWithCollection = docs.map(doc => ({
            ...doc,
            metadata: {
              ...doc.metadata,
              collectionName: collection,
              originalFilename: originalFilename
            }
          }));

          allRelevantDocs.push(...docsWithCollection);
          searchResults.push({
            collection,
            originalFilename,
            docCount: docs.length
          });
        }
      } catch (error) {
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
        searchResults: searchResults
      });
    }

    // Prepare context for the AI model
    const context = allRelevantDocs
      .map((doc, index) => {
        const filename = doc.metadata.originalFilename || 'Unknown PDF';
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
    const geminiResponse = await model.generateContent(QA_PROMPT);
    const responseText = geminiResponse.response.text();

    // Format response
    return res.json({
      success: true,
      message: responseText,
      documents: allRelevantDocs.map(doc => ({
        pageContent: doc.pageContent,
        metadata: doc.metadata
      })),
      query: userQuery,
      searchResults: searchResults,
      totalDocuments: allRelevantDocs.length
    });

  } catch (error) {
    console.error("Error in chat endpoint:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Sorry, I encountered an error processing your request.",
      debug: error.message
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
app.listen(PORT, () => {
  console.log(`Server started on PORT: ${PORT}`);
  console.log("Worker started and listening for jobs...");
});