import { Response } from 'express';

interface ErrorResponse {
  code: number;
  data: Record<string, never>; // or use `any` if you might add data later
  message: string;
}

export const errorHandler = (
  statusCode: number, 
  res: Response, 
  message: string
): void => {
  const error = new Error();
  (error as any).statusCode = statusCode; // Augment Error type
  error.message = message;
  
  const response: ErrorResponse = {
    code: statusCode,
    data: {},
    message: error.message,
  };

  res.status(statusCode).json(response);
};