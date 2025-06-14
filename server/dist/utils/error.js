"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = void 0;
const errorHandler = (statusCode, res, message) => {
    const error = new Error();
    error.statusCode = statusCode; // Augment Error type
    error.message = message;
    const response = {
        code: statusCode,
        data: {},
        message: error.message,
    };
    res.status(statusCode).json(response);
};
exports.errorHandler = errorHandler;
