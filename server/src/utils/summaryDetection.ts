const SUMMARY_KEYWORDS = [
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

export function isSummaryRequest(query: string): boolean {
  const lowercaseQuery = query.toLowerCase();
  return SUMMARY_KEYWORDS.some((keyword) => lowercaseQuery.includes(keyword));
}
