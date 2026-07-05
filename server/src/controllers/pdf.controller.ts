import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import PDFMetadata from "../models/pdf.model";
import ChatMessage from "../models/chat.model";
import User from "../models/user.model";
import { queue } from "../config/queue";
import { deleteQdrantCollection } from "../services/retrieval.service";
import {
  processChatQuery,
  resolveChatContext,
  saveAssistantMessage,
  saveUserMessage,
} from "../services/chat.service";

export const uploadPdf = async (req: Request, res: Response): Promise<void> => {
  if (!req.file) {
    res.status(400).json({ success: false, message: "No file uploaded" });
    return;
  }

  const userId = (req as any).userId;

  try {
    const filePath = path.resolve(req.file.path);

    await new Promise((resolve) => setTimeout(resolve, 100));

    if (!fs.existsSync(filePath)) {
      console.error(`File does not exist after upload: ${filePath}`);
      res.status(500).json({
        success: false,
        error: "File upload failed - file not found",
      });
      return;
    }

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

    const job = await queue.add(
      "file",
      {
        userId,
        filename: req.file.originalname,
        destination: req.file.destination,
        path: filePath,
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        delay: 500,
      }
    );

    res.json({
      success: true,
      message: "PDF uploaded and being processed",
      jobId: job.id,
    });
  } catch (error) {
    console.error("Error processing upload:", error);

    if (req.file?.path && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        console.error(`Error cleaning up file: ${cleanupError}`);
      }
    }

    res.status(500).json({ success: false, error: "Failed to process upload" });
  }
};

export const getPdfs = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const pdfs = await PDFMetadata.find({ userId }).sort({ uploadTime: -1 });
    res.json({ success: true, pdfs });
  } catch (error) {
    console.error("Error fetching PDFs:", error);
    res.status(500).json({ success: false, error: "Failed to fetch PDF list" });
  }
};

export const chatWithPdf = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userQuery = req.query.message as string;
    const collectionName = req.query.collection as string | undefined;
    const userId = (req as any).userId;
    const isGuest = (req as any).isGuest === true;

    const resolved = await resolveChatContext({
      userQuery,
      collectionName,
      userId,
      isGuest,
    });

    if (!resolved.ok) {
      if (resolved.error === "Message parameter is required") {
        res.status(400).json({ error: resolved.error, success: false });
        return;
      }
      if (resolved.error === "User not found") {
        res.status(404).json({ success: false, error: resolved.error });
        return;
      }
      res.json({
        success: false,
        error: resolved.error,
        message: resolved.message,
      });
      return;
    }

    const { effectiveUserId, collectionsToSearch, collectionName: resolvedCollection } =
      resolved.context;

    console.log(
      `Processing query: "${userQuery}" for collection: ${resolvedCollection || "all"} [${isGuest ? "guest" : "user"}]`
    );

    try {
      await saveUserMessage(effectiveUserId, resolvedCollection, userQuery);
    } catch (error) {
      console.error("Error saving user message:", error);
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendEvent = (payload: object) =>
      res.write(`data: ${JSON.stringify(payload)}\n\n`);

    const { fullText, documents, isSummary } = await processChatQuery(
      userQuery,
      collectionsToSearch,
      effectiveUserId,
      (event) => sendEvent(event)
    );

    res.end();

    try {
      await saveAssistantMessage(
        effectiveUserId,
        resolvedCollection,
        fullText,
        documents,
        isSummary
      );
    } catch (err) {
      console.error("Error saving assistant message:", err);
    }
  } catch (error: any) {
    console.error("Error in chat endpoint:", error);
    const userMsg =
      error?.status === 503
        ? "Gemini is temporarily overloaded — please try again in a few seconds."
        : "Something went wrong. Please try again.";

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: "error", message: userMsg })}\n\n`);
      res.end();
    } else {
      res.status(500).json({
        success: false,
        error: "Internal server error",
        message: "Sorry, I encountered an error processing your request.",
      });
    }
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
      res.status(404).json({ success: false, error: "Job not found" });
      return;
    }

    const state = await job.getState();
    res.json({ success: true, jobId, state, progress: job.progress });
  } catch (error) {
    console.error("Error getting job status:", error);
    res.status(500).json({ success: false, error: "Failed to get job status" });
  }
};

export const deletePdf = async (req: Request, res: Response): Promise<void> => {
  try {
    const { collectionName } = req.params;
    const userId = (req as any).userId;
    const isGuest = (req as any).isGuest === true;

    let effectiveUserId: any = userId;
    if (!isGuest) {
      const user = await User.findById(userId);
      if (!user) {
        res.status(404).json({ success: false, error: "User not found" });
        return;
      }
      effectiveUserId = user._id;
    }

    const pdfToDelete = await PDFMetadata.findOne({
      collectionName,
      userId: effectiveUserId,
    });

    if (!pdfToDelete) {
      res.status(404).json({ success: false, error: "PDF not found or not owned by user" });
      return;
    }

    const totalPDFsBeforeDeletion = await PDFMetadata.countDocuments({
      userId: effectiveUserId,
    });
    const isLastPDF = totalPDFsBeforeDeletion === 1;

    const deletedPDF = await PDFMetadata.findOneAndDelete({
      collectionName,
      userId: effectiveUserId,
    });

    if (!deletedPDF) {
      res.status(500).json({ success: false, error: "Failed to delete PDF from database" });
      return;
    }

    if (isLastPDF) {
      await ChatMessage.deleteMany({
        userId: effectiveUserId,
        collectionName: null,
      }).catch(console.error);
    }

    await ChatMessage.deleteMany({
      userId: effectiveUserId,
      collectionName,
    }).catch(console.error);

    res.json({
      success: true,
      message: "PDF deleted successfully",
      wasLastPDF: isLastPDF,
      deletedCollection: collectionName,
    });

    // Clean up Qdrant collection in the background — this can take a moment
    // and doesn't need to block the response.
    setImmediate(async () => {
      try {
        await deleteQdrantCollection(collectionName);
        console.log(`Qdrant collection deleted: ${collectionName}`);
      } catch (bgError) {
        console.error("Background cleanup error:", bgError);
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
    const userId = (req as any).userId;

    const query: Record<string, unknown> = { userId };
    query.collectionName = collectionName || null;

    const messages = await ChatMessage.find(query)
      .sort({ timestamp: 1 })
      .limit(parseInt(limit as string) || 50);

    res.json({ success: true, messages });
  } catch (error) {
    console.error("Error fetching chat history:", error);
    res.status(500).json({ success: false, error: "Failed to fetch chat history" });
  }
};
