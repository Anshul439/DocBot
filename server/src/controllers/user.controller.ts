import { NextFunction, Request, Response } from "express";
import User from "../models/user.model.js";
import { errorHandler } from "../utils/error.js";

// Check if user exists by Clerk ID
export const checkUserExists = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { clerkId } = req.params;

    if (!clerkId) {
      return next(errorHandler(400, res, "Clerk ID is required"));
    }

    const user = await User.findOne({ clerkId });

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
    } else {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
  } catch (error) {
    console.error("Error checking user existence:", error);
    next(errorHandler(500, res, "Server error while checking user"));
  }
};

// Sync/Create Clerk user (updated to handle existing users better)
export const syncClerkUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { clerkId, email, firstName, lastName } = req.body;

    if (!clerkId || !email) {
      return next(errorHandler(400, res, "Clerk ID and email are required"));
    }

    let user = await User.findOne({ clerkId });

    if (user) {
      // User already exists, you can choose to update or return error
      // Option 1: Return error (current behavior)
      return next(errorHandler(400, res, "User already exists"));
      
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
    user = new User({
      clerkId,
      email,
      firstName: firstName || "",
      lastName: lastName || "",
    });

    await user.save();
    
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
  } catch (error) {
    console.error("Error creating user:", error);
    next(errorHandler(500, res, "Server error while syncing user"));
  }
};

// Optional: Get user by Clerk ID (useful for other operations)
export const getUserByClerkId = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { clerkId } = req.params;

    if (!clerkId) {
      return next(errorHandler(400, res, "Clerk ID is required"));
    }

    const user = await User.findOne({ clerkId });

    if (!user) {
      return next(errorHandler(404, res, "User not found"));
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
  } catch (error) {
    console.error("Error fetching user:", error);
    next(errorHandler(500, res, "Server error while fetching user"));
  }
};