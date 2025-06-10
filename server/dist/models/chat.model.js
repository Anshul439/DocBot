"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const chatMessageSchema = new mongoose_1.default.Schema({
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
        type: [mongoose_1.default.Schema.Types.Mixed],
        default: []
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
});
// Compound index for faster queries
chatMessageSchema.index({ userId: 1, collectionName: 1 });
const ChatMessage = mongoose_1.default.model("ChatMessage", chatMessageSchema);
exports.default = ChatMessage;
