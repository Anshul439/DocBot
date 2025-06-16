import mongoose, { Schema, Document } from "mongoose";

interface IChatMessage extends Document {
  userId: string; // Clerk user ID
  collectionName: string | null; // null for "all PDFs" chat
  role: "assistant" | "user";
  content: string;
  documents?: any[]; // Array of document references if any
  timestamp: Date;
}

const ChatMessageSchema: Schema = new Schema({
  userId: { type: String, required: true },
  collectionName: { type: String, default: null }, // null represents "all PDFs" chat
  role: { type: String, enum: ["assistant", "user"], required: true },
  content: { type: String, required: true },
  documents: { type: Schema.Types.Mixed, default: [] },
  timestamp: { type: Date, default: Date.now }
});

// Compound index for faster querying
ChatMessageSchema.index({ userId: 1, collectionName: 1, timestamp: 1 });

export default mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema);