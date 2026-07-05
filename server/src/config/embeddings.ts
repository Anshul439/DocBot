import { GoogleGenAI } from "@google/genai";
import { Embeddings, EmbeddingsParams } from "@langchain/core/embeddings";
import { EMBEDDING_MODEL, VECTOR_SIZE } from "./rag.constants";

/**
 * Custom embeddings class using the new @google/genai SDK which properly
 * supports gemini-embedding-001 via the embedContent / batchEmbedContents API.
 *
 * The old @langchain/google-genai@0.2.x wrapper used @google/generative-ai
 * (v0.x SDK) whose batchEmbedContents silently returns empty arrays for
 * newer Gemini embedding models, causing "Vector dimension error: got 0".
 */
export class GeminiEmbeddings extends Embeddings {
  private client: GoogleGenAI;

  constructor(params?: EmbeddingsParams) {
    super(params ?? {});
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY environment variable is not set");
    }
    this.client = new GoogleGenAI({ apiKey });
  }

  async embedQuery(text: string): Promise<number[]> {
    const response = await this.client.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: text,
      config: { outputDimensionality: VECTOR_SIZE },
    });

    const values = response.embeddings?.[0]?.values;
    if (!values || values.length === 0) {
      throw new Error(
        `Gemini embedding returned empty vector for query. Model: ${EMBEDDING_MODEL}`
      );
    }
    return values;
  }

  async embedDocuments(documents: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    // Process in batches of 20 (safe limit for batchEmbedContents)
    const BATCH_SIZE = 20;
    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      const batch = documents.slice(i, i + BATCH_SIZE);

      const response = await this.client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: batch,
        config: { outputDimensionality: VECTOR_SIZE },
      });

      if (!response.embeddings || response.embeddings.length === 0) {
        throw new Error(
          `Gemini embedding returned empty batch at index ${i}. Model: ${EMBEDDING_MODEL}`
        );
      }

      for (const embedding of response.embeddings) {
        if (!embedding.values || embedding.values.length === 0) {
          throw new Error(`Empty embedding values in batch at index ${i}`);
        }
        embeddings.push(embedding.values);
      }
    }

    return embeddings;
  }
}
