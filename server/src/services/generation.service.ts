import { getGenerativeModel } from "../config/gemini";
import { ComprehensiveContent, DocumentResult } from "../types/pdf.types";

export type TokenCallback = (token: string) => void;

export async function streamSummary(
  userQuery: string,
  comprehensiveContent: ComprehensiveContent[],
  onToken: TokenCallback
): Promise<string> {
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

  const prompt = `
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

  return streamModelResponse(prompt, onToken);
}

export async function streamQA(
  userQuery: string,
  relevantDocs: DocumentResult[],
  onToken: TokenCallback
): Promise<string> {
  const context = relevantDocs
    .map((doc, index) => {
      const filename = doc.metadata?.originalFilename || "Unknown PDF";
      return `[Document ${index + 1} - ${filename}]\n${doc.pageContent}`;
    })
    .join("\n\n");

  const prompt = `
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

  return streamModelResponse(prompt, onToken);
}

async function streamModelResponse(
  prompt: string,
  onToken: TokenCallback
): Promise<string> {
  const model = getGenerativeModel();
  const stream = await model.generateContentStream(prompt);
  let fullText = "";

  for await (const chunk of stream.stream) {
    const text = chunk.text();
    fullText += text;
    if (text) onToken(text);
  }

  return fullText;
}
