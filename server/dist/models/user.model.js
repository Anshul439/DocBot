"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const userSchema = new mongoose_1.default.Schema({
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
    createdAt: {
        type: Date,
        default: Date.now,
    },
});
const User = mongoose_1.default.model("User", userSchema);
exports.default = User;
