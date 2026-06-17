import { Types } from "mongoose";
import { QdrantVectorStore } from "@langchain/qdrant";
import PDFMetadata from "../models/pdf.model";
import { qdrantClient } from "../config/qdrant";
import { createEmbeddings } from "../config/gemini";
import {
  SIMILARITY_TOP_K,
  SUMMARY_CHUNK_LIMIT,
  SUMMARY_SCROLL_LIMIT,
} from "../config/rag.constants";
import { ComprehensiveContent, DocumentResult } from "../types/pdf.types";

type UserId = Types.ObjectId | string;

async function getOriginalFilename(
  collection: string,
  userId: UserId
): Promise<string> {
  const pdfMetadata = await PDFMetadata.findOne({
    collectionName: collection,
    userId,
  });
  return pdfMetadata?.originalFilename ?? collection;
}

export async function getComprehensiveContent(
  collectionsToSearch: string[],
  userId: UserId
): Promise<ComprehensiveContent[]> {
  const allContent: ComprehensiveContent[] = [];
  const embeddings = createEmbeddings();

  console.log(
    `Attempting to get content from ${collectionsToSearch.length} collections`
  );

  for (const collection of collectionsToSearch) {
    try {
      console.log(`Getting comprehensive content from collection: ${collection}`);

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
        console.error(`Collection ${collection} doesn't exist:`, collectionError);
        continue;
      }

      const originalFilename = await getOriginalFilename(collection, userId);

      try {
        const scrollResponse = await qdrantClient.scroll(collection, {
          limit: SUMMARY_SCROLL_LIMIT,
          with_payload: true,
          with_vector: false,
        });

        console.log(
          `Retrieved ${scrollResponse.points.length} points from ${collection}`
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
              collectionName: collection,
              content: contentChunks.join("\n\n"),
              chunkCount: contentChunks.length,
              totalChunks: scrollResponse.points.length,
            });
            continue;
          }
        }
      } catch (scrollError) {
        console.error(`Error during scroll for collection ${collection}:`, scrollError);
      }

      // Fallback: similarity search with a generic query
      try {
        const vectorStore = await QdrantVectorStore.fromExistingCollection(
          embeddings,
          {
            url: process.env.QDRANT_URL,
            apiKey: process.env.QDRANT_API_KEY,
            collectionName: collection,
          }
        );

        const fallbackResults = await vectorStore.similaritySearch(
          "content document text",
          5
        );

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
        }
      } catch (fallbackError) {
        console.error(`Fallback also failed for ${collection}:`, fallbackError);
      }
    } catch (error) {
      console.error(`Error processing collection ${collection}:`, error);
    }
  }

  console.log(`Total content retrieved from ${allContent.length} collections`);
  return allContent;
}

export async function similaritySearchAcrossCollections(
  userQuery: string,
  collectionsToSearch: string[],
  userId: UserId
): Promise<DocumentResult[]> {
  const embeddings = createEmbeddings();
  const allRelevantDocs: DocumentResult[] = [];

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

      const docs = await vectorStore.similaritySearch(userQuery, SIMILARITY_TOP_K);

      if (docs.length > 0) {
        const originalFilename = await getOriginalFilename(collection, userId);

        for (const doc of docs) {
          allRelevantDocs.push({
            pageContent: doc.pageContent,
            metadata: {
              ...doc.metadata,
              collectionName: collection,
              originalFilename,
            },
          });
        }
      }
    } catch (error) {
      console.error(`Error searching in collection ${collection}:`, error);
    }
  }

  return allRelevantDocs;
}

export async function deleteQdrantCollection(collectionName: string): Promise<void> {
  await qdrantClient.deleteCollection(collectionName);
}
