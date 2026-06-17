import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { EMBEDDING_MODEL, GENERATION_MODEL } from "./rag.constants";

export const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY as string);

export function createEmbeddings() {
  return new GoogleGenerativeAIEmbeddings({
    apiKey: process.env.GOOGLE_API_KEY,
    modelName: EMBEDDING_MODEL,
  });
}

export function getGenerativeModel() {
  return genAI.getGenerativeModel({ model: GENERATION_MODEL });
}
