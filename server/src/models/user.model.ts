import mongoose, { Document, Schema, Model } from "mongoose";

interface IUser extends Document {
  clerkId: string;
  email?: string;
  name?: string;
  image?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const userSchema: Schema<IUser> = new mongoose.Schema(
  {
    clerkId: {
      type: String,
      required: true,
      unique: true,
    },
    email: String,
    name: String,
    image: {
      type: [String],
    },
  },
  { timestamps: true }
);

const User: Model<IUser> = mongoose.model<IUser>("User", userSchema);

export default User;
