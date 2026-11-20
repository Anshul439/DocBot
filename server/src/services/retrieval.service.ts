import { Types } from "mongoose";
import { QdrantVectorStore } from "@langchain/qdrant";
import PDFMetadata from "../models/pdf.model";
import { qdrantClient } from "../config/qdrant";
import { createEmbeddings } from "../config/gemini";
import {
  SIMILARITY_TOP_K,
  SIMILARITY_SCORE_THRESHOLD,
  SUMMARY_CHUNK_LIMIT,
  SUMMARY_SCROLL_LIMIT,
  QDRANT_COLLECTION,
} from "../config/rag.constants";
import { ComprehensiveContent, DocumentResult } from "../types/pdf.types";

type UserId = Types.ObjectId | string;

async function getOriginalFilename(
  pdfId: string,
  userId: UserId
): Promise<string> {
  const pdfMetadata = await PDFMetadata.findOne({
    collectionName: pdfId,
    userId,
  });
  return pdfMetadata?.originalFilename ?? pdfId;
}

function collectionExists(): Promise<boolean> {
  return qdrantClient
    .getCollections()
    .then((res) => res.collections.some((c) => c.name === QDRANT_COLLECTION))
    .catch(() => false);
}

export async function getComprehensiveContent(
  collectionsToSearch: string[],
  userId: UserId
): Promise<ComprehensiveContent[]> {
  const allContent: ComprehensiveContent[] = [];

  if (!(await collectionExists())) return allContent;

  console.log(
    `Attempting to get content from ${collectionsToSearch.length} PDF(s)`
  );

  for (const pdfId of collectionsToSearch) {
    try {
      const originalFilename = await getOriginalFilename(pdfId, userId);

      const scrollResponse = await qdrantClient.scroll(QDRANT_COLLECTION, {
        limit: SUMMARY_SCROLL_LIMIT,
        with_payload: true,
        with_vector: false,
        filter: {
          must: [{ key: "metadata.pdfId", match: { value: pdfId } }],
        },
      });

      console.log(
        `Retrieved ${scrollResponse.points.length} points for pdfId: ${pdfId}`
      );

      if (scrollResponse.points.length > 0) {
        const contentChunks = scrollResponse.points
          .map((point) => {
            const payload = point.payload as Record<string, string> | undefined;
            return payload?.pageContent || payload?.content || "";
          })
          .filter((content) => content && content.trim().length > 20)
          .slice(0, SUMMARY_CHUNK_LIMIT);

        if (contentChunks.length > 0) {
          allContent.push({
            filename: originalFilename,
            collectionName: pdfId,
            content: contentChunks.join("\n\n"),
            chunkCount: contentChunks.length,
            totalChunks: scrollResponse.points.length,
          });
        }
      }
    } catch (error) {
      console.error(`Error getting content for pdfId ${pdfId}:`, error);
    }
  }

  console.log(`Total content retrieved from ${allContent.length} PDF(s)`);
  return allContent;
}

export async function similaritySearchAcrossCollections(
  userQuery: string,
  collectionsToSearch: string[],
  userId: UserId
): Promise<DocumentResult[]> {
  if (!(await collectionExists())) return [];

  const embeddings = createEmbeddings();

  const vectorStore = await QdrantVectorStore.fromExistingCollection(
    embeddings,
    {
      url: process.env.QDRANT_URL,
      apiKey: process.env.QDRANT_API_KEY,
      collectionName: QDRANT_COLLECTION,
    }
  );

  const filter = {
    should: collectionsToSearch.map((pdfId) => ({
      key: "metadata.pdfId",
      match: { value: pdfId },
    })),
  };

  try {
    const docsWithScores = await vectorStore.similaritySearchWithScore(
      userQuery,
      SIMILARITY_TOP_K,
      filter
    );

    const relevantDocs = docsWithScores.filter(
      ([, score]) => score >= SIMILARITY_SCORE_THRESHOLD
    );

    const allRelevantDocs: DocumentResult[] = [];

    const filenameCache = new Map<string, string>();

    for (const [doc] of relevantDocs) {
      const pdfId = doc.metadata?.pdfId as string;
      if (!filenameCache.has(pdfId)) {
        filenameCache.set(pdfId, await getOriginalFilename(pdfId, userId));
      }

      allRelevantDocs.push({
        pageContent: doc.pageContent,
        metadata: {
          ...doc.metadata,
          collectionName: pdfId,
          originalFilename: filenameCache.get(pdfId),
        },
      });
    }

    return allRelevantDocs;
  } catch (error) {
    console.error("Error searching across PDFs:", error);
    return [];
  }
}

export async function deleteQdrantPoints(pdfId: string): Promise<void> {
  await qdrantClient.delete(QDRANT_COLLECTION, {
    filter: {
      must: [{ key: "metadata.pdfId", match: { value: pdfId } }],
    },
  });
}
