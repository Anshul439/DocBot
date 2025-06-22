import mongoose, { Schema, Document, Types } from "mongoose";

interface IChatMessage extends Document {
  userId: string
  collectionName: string | null;
  role: string;
  content: string;
  documents?: any[];
  isSummary?: boolean;
  timestamp: Date;
}

const ChatMessageSchema: Schema = new Schema({
  userId: { type: String, required: true },
  collectionName: { type: String },
  role: { type: String, required: true },
  content: { type: String, required: true },
  documents: { type: Schema.Types.Mixed },
  isSummary: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now }
});

export default mongoose.model<IChatMessage>("ChatMessage", ChatMessageSchema);