import mongoose, { Schema, Document, Types  } from "mongoose";

interface IPDFMetadata extends Document {
  originalFilename: string;
  collectionName: string;
  uploadTime: Date;
  chunks: number;
  filePath: string;
  userId: string
}

const PDFMetadataSchema: Schema = new Schema({
  originalFilename: { type: String, required: true },
  collectionName: { type: String, required: true, unique: true },
  uploadTime: { type: Date, default: Date.now },
  chunks: { type: Number, required: true },
  filePath: { type: String, required: true },
  userId: { type: String, required: true }
});

export default mongoose.model<IPDFMetadata>("PDFMetadata", PDFMetadataSchema);