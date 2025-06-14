"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clerkAuth = void 0;
const clerk_sdk_node_1 = require("@clerk/clerk-sdk-node");
exports.clerkAuth = (0, clerk_sdk_node_1.ClerkExpressRequireAuth)();
