import { Request, Response } from "express";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { QdrantClient } from "@qdrant/js-client-rest";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { QdrantVectorStore } from "@langchain/qdrant";
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { CharacterTextSplitter } from "@langchain/textsplitters";
import { GoogleGenerativeAI } from "@google/generative-ai";
import PDFMetadata from "../models/pdf.model";
import ChatMessage from "../models/chat.model";
import User from "../models/user.model";
import { queue } from "../index";
import { ComprehensiveContent, DocumentResult } from "../types/pdf.types";

// Fixed helper function to get comprehensive content for summaries
async function getComprehensiveContent(
  collectionsToSearch: string[],
  embeddings: GoogleGenerativeAIEmbeddings,
  userId: mongoose.Types.ObjectId
): Promise<ComprehensiveContent[]> {
  const allContent: ComprehensiveContent[] = [];

  console.log(
    `Attempting to get content from ${collectionsToSearch.length} collections`
  );

  for (const collection of collectionsToSearch) {
    try {
      console.log(
        `Getting comprehensive content from collection: ${collection}`
      );

      // First, let's check if the collection actually exists and has data
      let collectionInfo;
      try {
        collectionInfo = await qdrantClient.getCollection(collection);
        console.log(
          `Collection ${collection} exists with ${collectionInfo.points_count} points`
        );

        if (collectionInfo.points_count === 0) {
          console.log(`Collection ${collection} is empty, skipping`);
          continue;
        }
      } catch (collectionError) {
        console.error(
          `Collection ${collection} doesn't exist:`,
          collectionError
        );
        continue;
      }

      // Get metadata from MongoDB instead of session storage
      let originalFilename = collection; // Default fallback
      const pdfMetadata = await PDFMetadata.findOne({
        collectionName: collection,
        userId: userId,
      });

      if (pdfMetadata) {
        originalFilename = pdfMetadata.originalFilename;
        console.log(
          `Found MongoDB metadata for ${collection}: ${originalFilename}`
        );
      } else {
        console.log(`No metadata found in MongoDB for ${collection}`);
      }

      // Get content from the collection using scroll (more reliable than similarity search for summaries)
      try {
        const scrollResponse = await qdrantClient.scroll(collection, {
          limit: 15, // Get more chunks for better summary
          with_payload: true,
          with_vector: false,
        });

        console.log(
          `Retrieved ${scrollResponse.points.length} points from ${collection}`
        );

        if (scrollResponse.points.length > 0) {
          const contentChunks = scrollResponse.points
            .map((point: any) => {
              // Handle different payload structures
              const content =
                point.payload?.pageContent || point.payload?.content || "";
              return content;
            })
            .filter((content: string) => content && content.trim().length > 20) // More lenient filter
            .slice(0, 10); // Take first 10 substantial chunks

          console.log(
            `Filtered to ${contentChunks.length} substantial chunks from ${collection}`
          );

          if (contentChunks.length > 0) {
            const combinedContent = contentChunks.join("\n\n");
            allContent.push({
              filename: originalFilename,
              collectionName: collection,
              content: combinedContent,
              chunkCount: contentChunks.length,
              totalChunks: scrollResponse.points.length,
            });

            console.log(
              `Successfully added content from ${collection}: ${combinedContent.length} characters`
            );
          } else {
            console.log(
              `No substantial content found in ${collection} after filtering`
            );
          }
        } else {
          console.log(`No points returned from scroll for ${collection}`);
        }
      } catch (scrollError) {
        console.error(
          `Error during scroll for collection ${collection}:`,
          scrollError
        );

        // Fallback: try using vector store approach
        try {
          console.log(`Trying vector store approach for ${collection}`);
          const vectorStore = await QdrantVectorStore.fromExistingCollection(
            embeddings,
            {
              url: process.env.QDRANT_URL,
              apiKey: process.env.QDRANT_API_KEY,
              collectionName: collection,
            }
          );

          // Use a generic query to get some content
          const fallbackResults = await vectorStore.similaritySearch(
            "content document text",
            5
          );

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
        } catch (fallbackError) {
          console.error(
            `Fallback also failed for ${collection}:`,
            fallbackError
          );
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

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY as string);
const qdrantClient = new QdrantClient({
  url: process.env.QDRANT_URL,
  apiKey: process.env.QDRANT_API_KEY,
});

// Helper function to detect summary requests
function isSummaryRequest(query: string): boolean {
  const summaryKeywords = [
    "summarize",
    "compare",
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

// Controller methods
export const uploadPdf = async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ success: false, message: "No file uploaded" });
    return;
  }

  const clerkUserId = (req as any).auth.userId;

  try {
    // SOLUTION 1: Verify file exists before adding to queue
    const filePath = req.file.path;

    // Wait a bit and verify file exists
    await new Promise((resolve) => setTimeout(resolve, 100)); // Small delay

    if (!fs.existsSync(filePath)) {
      console.error(`File does not exist after upload: ${filePath}`);
      res.status(500).json({
        success: false,
        error: "File upload failed - file not found",
      });
      return;
    }

    // Also check file size to ensure it's fully written
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      console.error(`File is empty after upload: ${filePath}`);
      res.status(500).json({
        success: false,
        error: "File upload failed - empty file",
      });
      return;
    }

    console.log(`File verified: ${filePath} (${stats.size} bytes)`);

    // Find or create the user in your MongoDB
    const user = await User.findOneAndUpdate(
      { clerkId: clerkUserId },
      {},
      { upsert: true, new: true }
    );

    // Add to queue for processing with user ID
    const job = await queue.add(
      "file",
      {
        userId: user._id,
        clerkId: clerkUserId,
        filename: req.file.originalname,
        destination: req.file.destination,
        path: filePath, // Use the verified path
      },
      {
        // SOLUTION 2: Add job options for retry and delay
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
        delay: 500, // Wait 500ms before processing
      }
    );

    res.json({
      success: true,
      message: "PDF uploaded and being processed",
      jobId: job.id,
    });
  } catch (error) {
    console.error("Error processing upload:", error);

    // Clean up file if it exists
    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
        console.log(`Cleaned up file after error: ${req.file.path}`);
      } catch (cleanupError) {
        console.error(`Error cleaning up file: ${cleanupError}`);
      }
    }

    res.status(500).json({
      success: false,
      error: "Failed to process upload",
    });
  }
};

export const getPdfs = async (req: Request, res: Response): Promise<void> => {
  try {
    const clerkUserId = (req as any).auth.userId;

    // Find the user in MongoDB
    const user = await User.findOne({ clerkId: clerkUserId });
    if (!user) {
      res.json({ success: true, pdfs: [] }); // No user means no PDFs
      return;
    }

    // Find PDFs associated with this user
    const pdfs = await PDFMetadata.find({ userId: user._id })
      .sort({ uploadTime: -1 })
      .populate("userId", "name email"); // Optional: populate user info

    res.json({
      success: true,
      pdfs: pdfs,
    });
  } catch (error) {
    console.error("Error fetching PDFs:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch PDF list",
    });
  }
};

export const chatWithPdf = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userQuery = req.query.message as string;
    const collectionName = req.query.collection as string;
    const clerkUserId = (req as any).auth.userId;

    if (!userQuery) {
      res.status(400).json({
        error: "Message parameter is required",
        success: false,
      });
      return;
    }

    // Find the user in MongoDB using Clerk ID
    const user = await User.findOne({ clerkId: clerkUserId });
    if (!user) {
      res.status(404).json({
        success: false,
        error: "User not found",
      });
      return;
    }

    console.log(
      `Processing query: "${userQuery}" for collection: ${
        collectionName || "all"
      }`
    );

    let collectionsToSearch: string[] = [];
    if (collectionName) {
      const pdf = await PDFMetadata.findOne({
        collectionName,
        userId: user._id, // Ensure PDF belongs to user
      });
      if (!pdf) {
        res.json({
          success: false,
          error: `The PDF collection "${collectionName}" was not found.`,
          message: "This PDF may have been deleted or is not accessible.",
        });
        return;
      }
      collectionsToSearch = [collectionName];
    } else {
      // Get all PDFs for this specific user
      const userPDFs = await PDFMetadata.find({ userId: user._id });
      collectionsToSearch = userPDFs.map((pdf) => pdf.collectionName);

      if (collectionsToSearch.length === 0) {
        res.json({
          success: false,
          error: "No PDFs have been uploaded yet",
          message: "Please upload a PDF before asking questions.",
        });
        return;
      }
    }

    // FIXED: Save user message to history for ALL cases (both specific PDF and all PDFs)
    if (collectionsToSearch.length > 0) {
      try {
        await ChatMessage.create({
          userId: user._id, // Use MongoDB user ID
          collectionName: collectionName || null, // This will be null for "all PDFs" and the specific collection name for individual PDFs
          role: "user",
          content: userQuery,
          timestamp: new Date(),
        });
      } catch (error) {
        console.error("Error saving user message:", error);
      }
    }

    const apiKey = process.env.GOOGLE_API_KEY as string;
    const embeddings = new GoogleGenerativeAIEmbeddings({
      apiKey,
      modelName: "models/embedding-001",
    });

    const isSummary = isSummaryRequest(userQuery);
    let responseText = "";
    let documents: DocumentResult[] = [];
    let isSummaryResponse = false;

    if (isSummary) {
      console.log(`Detected summary request`);
      isSummaryResponse = true;

      const comprehensiveContent = await getComprehensiveContent(
        collectionsToSearch,
        embeddings,
        user._id as mongoose.Types.ObjectId
      );

      if (comprehensiveContent.length === 0) {
        responseText =
          "I couldn't find sufficient content in the uploaded PDFs to create a summary.";
        documents = [];
      } else {
        const summaryContext = comprehensiveContent
          .map(
            (pdf) => `
=== ${pdf.filename} ===
Chunks: ${pdf.chunkCount}/${pdf.totalChunks}
Content:
${pdf.content}
        `
          )
          .join("\n\n");

        const SUMMARY_PROMPT = `
You are an expert at analyzing and summarizing PDF documents. 
Your task is to create a comprehensive, well-structured summary based on the following content from ${comprehensiveContent.length} PDF document(s).

Guidelines:
1. Analyze the content thoroughly and identify the most important information
2. Create a coherent summary that flows naturally
3. Include key points, findings, and conclusions
4. Maintain the original meaning and context
5. Organize the information logically based on the content
6. Don't mention "the document states" or similar phrases - just present the information directly
7. For multiple PDFs, identify connections or contrasts between them

PDF Content:
${summaryContext}

User Request: "${userQuery}"

Please provide a detailed, well-structured summary:`;

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const geminiResponse = await model.generateContent(SUMMARY_PROMPT);
        responseText = geminiResponse.response
          .text()
          .replace(/\*_/g, "*") // Remove italic markers when combined with bold
          .replace(/_/g, ""); // Remove all remaining italic markers

        documents = [];
      }
    } else {
      // Regular question answering
      let allRelevantDocs: any[] = [];
      let searchResults: any[] = [];

      for (const collection of collectionsToSearch) {
        try {
          const vectorStore = await QdrantVectorStore.fromExistingCollection(
            embeddings,
            {
              url: process.env.QDRANT_URL,
              apiKey: process.env.QDRANT_API_KEY,
              collectionName: collection,
            }
          );

          const docs = await vectorStore.similaritySearch(userQuery, 4);

          if (docs.length > 0) {
            let originalFilename = collection;
            const pdfMetadata = await PDFMetadata.findOne({
              collectionName: collection,
              userId: user._id,
            });
            if (pdfMetadata) {
              originalFilename = pdfMetadata.originalFilename;
            }

            const docsWithCollection = docs.map((doc) => ({
              ...doc,
              metadata: {
                ...doc.metadata,
                collectionName: collection,
                originalFilename: originalFilename,
              },
            }));

            allRelevantDocs.push(...docsWithCollection);

            searchResults.push({
              collection,
              originalFilename,
              docCount: docs.length,
            });
          }
        } catch (error) {
          console.error(`Error searching in collection ${collection}:`, error);
        }
      }

      if (allRelevantDocs.length === 0) {
        responseText =
          "I couldn't find any relevant information in the uploaded PDFs to answer your question.";
        documents = [];
      } else {
        const context = allRelevantDocs
          .map((doc, index) => {
            const filename = doc.metadata.originalFilename || "Unknown PDF";
            return `[Document ${index + 1} - ${filename}]\n${doc.pageContent}`;
          })
          .join("\n\n");

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

        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const geminiResponse = await model.generateContent(QA_PROMPT);
        responseText = geminiResponse.response
          .text()
          .replace(/\*_/g, "*") // Remove italic markers when combined with bold
          .replace(/_/g, ""); // Remove all remaining italic markers
        documents = allRelevantDocs.map((doc) => ({
          pageContent: doc.pageContent,
          metadata: doc.metadata,
        }));
      }
    }

    // Save assistant response to history
    try {
      await ChatMessage.create({
        userId: user._id, // Use MongoDB user ID
        collectionName: collectionName || null,
        role: "assistant",
        content: responseText,
        documents: documents,
        isSummary: isSummaryResponse,
        timestamp: new Date(),
      });
    } catch (error) {
      console.error("Error saving assistant message:", error);
    }

    res.json({
      success: true,
      message: responseText,
      documents: documents,
      query: userQuery,
      isSummary: isSummaryResponse,
    });
  } catch (error) {
    console.error("Error in chat endpoint:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: "Sorry, I encountered an error processing your request.",
    });
  }
};

export const getJobStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const jobId = req.params.id;
    const job = await queue.getJob(jobId);

    if (!job) {
      res.status(404).json({
        success: false,
        error: "Job not found",
      });
      return;
    }

    const state = await job.getState();

    res.json({
      success: true,
      jobId,
      state,
      progress: job.progress,
    });
  } catch (error) {
    console.error("Error getting job status:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get job status",
    });
  }
};

export const deletePdf = async (req: Request, res: Response): Promise<void> => {
  try {
    const { collectionName } = req.params;
    const clerkUserId = (req as any).auth.userId;

    console.log(
      `Delete request for collection: ${collectionName}, user: ${clerkUserId}`
    );

    // 1. Find user first
    const user = await User.findOne({ clerkId: clerkUserId });
    if (!user) {
      console.log("User not found");
      res.status(404).json({
        success: false,
        error: "User not found",
      });
      return;
    }

    // 2. Find and validate PDF ownership
    const pdfToDelete = await PDFMetadata.findOne({
      collectionName,
      userId: user._id,
    });

    if (!pdfToDelete) {
      console.log(`PDF not found or not owned by user: ${collectionName}`);
      res.status(404).json({
        success: false,
        error: "PDF not found or not owned by user",
      });
      return;
    }

    console.log(`Found PDF to delete: ${pdfToDelete.originalFilename}`);

    // 3. Check remaining PDFs count BEFORE deletion
    const totalPDFsBeforeDeletion = await PDFMetadata.countDocuments({
      userId: user._id,
    });
    const isLastPDF = totalPDFsBeforeDeletion === 1;

    // 4. Delete from database first (this is the critical operation)
    const deletedPDF = await PDFMetadata.findOneAndDelete({
      collectionName,
      userId: user._id,
    });

    if (!deletedPDF) {
      console.log("Failed to delete from database");
      res.status(500).json({
        success: false,
        error: "Failed to delete PDF from database",
      });
      return;
    }

    console.log(
      `Successfully deleted from database: ${deletedPDF.originalFilename}`
    );

    // 5. If this was the last PDF, delete "All PDFs" chat messages
    if (isLastPDF) {
      try {
        const deletedChatMessages = await ChatMessage.deleteMany({
          userId: user._id,
          collectionName: null, // These are "All PDFs" messages
        });
        console.log(
          `Deleted ${deletedChatMessages.deletedCount} "All PDFs" chat messages`
        );
      } catch (chatError) {
        console.error("Error deleting All PDFs chat messages:", chatError);
        // Don't fail the whole operation for this
      }
    }

    // 6. Delete specific PDF chat messages
    try {
      const deletedSpecificChats = await ChatMessage.deleteMany({
        userId: user._id,
        collectionName: collectionName,
      });
      console.log(
        `Deleted ${deletedSpecificChats.deletedCount} specific PDF chat messages`
      );
    } catch (chatError) {
      console.error("Error deleting specific PDF chat messages:", chatError);
      // Don't fail the whole operation for this
    }

    // 7. Respond to client immediately with success
    res.json({
      success: true,
      message: "PDF deleted successfully",
      wasLastPDF: isLastPDF,
      deletedCollection: collectionName,
    });

    // 8. Background cleanup operations (don't await - let them run async)
    setImmediate(async () => {
      try {
        // Delete file system file
        if (deletedPDF.filePath && fs.existsSync(deletedPDF.filePath)) {
          fs.unlink(deletedPDF.filePath, (err) => {
            if (err) {
              console.error(
                `File deletion error for ${deletedPDF.filePath}:`,
                err
              );
            } else {
              console.log(`File deleted: ${deletedPDF.filePath}`);
            }
          });
        }

        // Delete Qdrant collection
        try {
          await qdrantClient.deleteCollection(collectionName);
          console.log(`Qdrant collection deleted: ${collectionName}`);
        } catch (qdrantError) {
          console.error(
            `Qdrant deletion error for ${collectionName}:`,
            qdrantError
          );
          // You might want to implement a retry mechanism or cleanup job here
        }
      } catch (bgError) {
        console.error("Background cleanup error:", bgError);
        // Log to your error tracking system if you have one
      }
    });
  } catch (error) {
    console.error("PDF deletion error:", error);
    res.status(500).json({
      success: false,
      error: "Internal server error while deleting PDF",
    });
  }
};

export const getChatHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { collectionName, limit } = req.query;
    const clerkUserId = (req as any).auth.userId;

    // First find the user in MongoDB using Clerk ID
    const user = await User.findOne({ clerkId: clerkUserId });
    if (!user) {
      res.json({ success: true, messages: [] }); // No user means no messages
      return;
    }

    const query: any = { userId: user._id }; // Use MongoDB user ID
    if (collectionName) {
      query.collectionName = collectionName;
    } else {
      query.collectionName = null;
    }

    const messages = await ChatMessage.find(query)
      .sort({ timestamp: 1 })
      .limit(parseInt(limit as string) || 50);

    res.json({ success: true, messages });
  } catch (error) {
    console.error("Error fetching chat history:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch chat history",
    });
  }
};
