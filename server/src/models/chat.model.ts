import mongoose, { Document, Schema, Model } from "mongoose";

interface IChatMessage extends Document {
  userId: string; // Clerk user ID
  collectionName: string | null; // null for "all PDFs" chat
  role: "assistant" | "user";
  content: string;
  documents?: any[]; // Array of document references if needed
  timestamp: Date;
}

const chatMessageSchema: Schema<IChatMessage> = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  collectionName: {
    type: String,
    index: true,
    default: null
  },
  role: {
    type: String,
    required: true,
    enum: ["assistant", "user"]
  },
  content: {
    type: String,
    required: true
  },
  documents: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

// Compound index for faster queries
chatMessageSchema.index({ userId: 1, collectionName: 1 });

const ChatMessage: Model<IChatMessage> = mongoose.model<IChatMessage>("ChatMessage", chatMessageSchema);

export default ChatMessage;