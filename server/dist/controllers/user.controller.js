"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserByClerkId = exports.syncClerkUser = exports.checkUserExists = void 0;
const user_model_js_1 = __importDefault(require("../models/user.model.js"));
const error_js_1 = require("../utils/error.js");
// Check if user exists by Clerk ID
const checkUserExists = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { clerkId } = req.params;
        if (!clerkId) {
            return next((0, error_js_1.errorHandler)(400, res, "Clerk ID is required"));
        }
        const user = yield user_model_js_1.default.findOne({ clerkId });
        if (user) {
            return res.status(200).json({
                success: true,
                message: "User exists",
                user: {
                    id: user._id,
                    clerkId: user.clerkId,
                    email: user.email,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    createdAt: user.createdAt,
                    updatedAt: user.updatedAt
                }
            });
        }
        else {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }
    }
    catch (error) {
        console.error("Error checking user existence:", error);
        next((0, error_js_1.errorHandler)(500, res, "Server error while checking user"));
    }
});
exports.checkUserExists = checkUserExists;
// Sync/Create Clerk user (updated to handle existing users better)
const syncClerkUser = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { clerkId, email, firstName, lastName } = req.body;
        if (!clerkId || !email) {
            return next((0, error_js_1.errorHandler)(400, res, "Clerk ID and email are required"));
        }
        let user = yield user_model_js_1.default.findOne({ clerkId });
        if (user) {
            // User already exists, you can choose to update or return error
            // Option 1: Return error (current behavior)
            return next((0, error_js_1.errorHandler)(400, res, "User already exists"));
            // Option 2: Update existing user (uncomment if you prefer this)
            /*
            user.email = email;
            user.firstName = firstName || user.firstName;
            user.lastName = lastName || user.lastName;
            await user.save();
            
            return res.status(200).json({
              success: true,
              message: "User updated successfully",
              user: {
                id: user._id,
                clerkId: user.clerkId,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
              }
            });
            */
        }
        // Create new user
        user = new user_model_js_1.default({
            clerkId,
            email,
            firstName: firstName || "",
            lastName: lastName || "",
        });
        yield user.save();
        res.status(201).json({
            success: true,
            message: "User created successfully",
            user: {
                id: user._id,
                clerkId: user.clerkId,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });
    }
    catch (error) {
        console.error("Error creating user:", error);
        next((0, error_js_1.errorHandler)(500, res, "Server error while syncing user"));
    }
});
exports.syncClerkUser = syncClerkUser;
// Optional: Get user by Clerk ID (useful for other operations)
const getUserByClerkId = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { clerkId } = req.params;
        if (!clerkId) {
            return next((0, error_js_1.errorHandler)(400, res, "Clerk ID is required"));
        }
        const user = yield user_model_js_1.default.findOne({ clerkId });
        if (!user) {
            return next((0, error_js_1.errorHandler)(404, res, "User not found"));
        }
        res.status(200).json({
            success: true,
            user: {
                id: user._id,
                clerkId: user.clerkId,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });
    }
    catch (error) {
        console.error("Error fetching user:", error);
        next((0, error_js_1.errorHandler)(500, res, "Server error while fetching user"));
    }
});
exports.getUserByClerkId = getUserByClerkId;
