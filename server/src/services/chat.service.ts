import { Types } from "mongoose";
import PDFMetadata from "../models/pdf.model";
import User from "../models/user.model";
import ChatMessage from "../models/chat.model";
import { isSummaryRequest } from "../utils/summaryDetection";
import {
  getComprehensiveContent,
  similaritySearchAcrossCollections,
} from "./retrieval.service";
import { streamQA, streamSummary } from "./generation.service";
import { DocumentResult } from "../types/pdf.types";

type UserId = Types.ObjectId | string;

export interface ChatRequest {
  userQuery: string;
  collectionName?: string;
  userId: string;
  isGuest: boolean;
}

export interface ChatStreamEvent {
  type: "token" | "documents" | "done" | "error";
  content?: string;
  documents?: DocumentResult[];
  isSummary?: boolean;
  message?: string;
}

export interface ResolvedChatContext {
  effectiveUserId: UserId;
  collectionsToSearch: string[];
  collectionName: string | null;
}

export async function resolveChatContext(
  request: ChatRequest
): Promise<{ ok: true; context: ResolvedChatContext } | { ok: false; error: string; message?: string }> {
  const { userQuery, collectionName, userId, isGuest } = request;

  if (!userQuery) {
    return { ok: false, error: "Message parameter is required" };
  }

  let effectiveUserId: UserId = userId;
  if (!isGuest) {
    const user = await User.findById(userId);
    if (!user) {
      return { ok: false, error: "User not found" };
    }
    effectiveUserId = user._id as Types.ObjectId;
  }

  let collectionsToSearch: string[] = [];

  if (collectionName) {
    const pdf = await PDFMetadata.findOne({
      collectionName,
      userId: effectiveUserId,
    });
    if (!pdf) {
      return {
        ok: false,
        error: `The PDF collection "${collectionName}" was not found.`,
        message: "This PDF may have been deleted or is not accessible.",
      };
    }
    collectionsToSearch = [collectionName];
  } else {
    const userPDFs = await PDFMetadata.find({ userId: effectiveUserId });
    collectionsToSearch = userPDFs.map((pdf) => pdf.collectionName);

    if (collectionsToSearch.length === 0) {
      return {
        ok: false,
        error: "No PDFs have been uploaded yet",
        message: "Please upload a PDF before asking questions.",
      };
    }
  }

  return {
    ok: true,
    context: {
      effectiveUserId,
      collectionsToSearch,
      collectionName: collectionName ?? null,
    },
  };
}

export async function saveUserMessage(
  effectiveUserId: UserId,
  collectionName: string | null,
  content: string
): Promise<void> {
  await ChatMessage.create({
    userId: effectiveUserId,
    collectionName,
    role: "user",
    content,
    timestamp: new Date(),
  });
}

export async function saveAssistantMessage(
  effectiveUserId: UserId,
  collectionName: string | null,
  content: string,
  documents: DocumentResult[],
  isSummary: boolean
): Promise<void> {
  await ChatMessage.create({
    userId: effectiveUserId,
    collectionName,
    role: "assistant",
    content,
    documents,
    isSummary,
    timestamp: new Date(),
  });
}

export async function processChatQuery(
  userQuery: string,
  collectionsToSearch: string[],
  effectiveUserId: UserId,
  onEvent: (event: ChatStreamEvent) => void
): Promise<{ fullText: string; documents: DocumentResult[]; isSummary: boolean }> {
  const isSummary = isSummaryRequest(userQuery);
  let fullText = "";
  let documents: DocumentResult[] = [];

  if (isSummary) {
    console.log("Detected summary request");

    const comprehensiveContent = await getComprehensiveContent(
      collectionsToSearch,
      effectiveUserId
    );

    if (comprehensiveContent.length === 0) {
      fullText =
        "I couldn't find sufficient content in the uploaded PDFs to create a summary.";
      onEvent({ type: "token", content: fullText });
    } else {
      fullText = await streamSummary(userQuery, comprehensiveContent, (token) => {
        onEvent({ type: "token", content: token });
      });
    }
  } else {
    documents = await similaritySearchAcrossCollections(
      userQuery,
      collectionsToSearch,
      effectiveUserId
    );

    if (documents.length === 0) {
      fullText =
        "I couldn't find any relevant information in the uploaded PDFs to answer your question.";
      onEvent({ type: "token", content: fullText });
    } else {
      fullText = await streamQA(userQuery, documents, (token) => {
        onEvent({ type: "token", content: token });
      });
    }
  }

  onEvent({ type: "documents", documents });
  onEvent({ type: "done", isSummary });

  return { fullText, documents, isSummary };
}
