import { GoogleGenerativeAI } from "@google/generative-ai";
import { GeminiEmbeddings } from "./embeddings";
import { GENERATION_MODEL } from "./rag.constants";

export const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY as string);

export function createEmbeddings() {
  return new GeminiEmbeddings();
}

export function getGenerativeModel() {
  return genAI.getGenerativeModel({ model: GENERATION_MODEL });
}
