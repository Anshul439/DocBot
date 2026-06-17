import { Queue } from "bullmq";
import { getRedisConnection } from "./redis";

export const QUEUE_NAME =
  process.env.NODE_ENV === "production"
    ? "file-upload-queue"
    : "file-upload-queue-dev";

export const queue = new Queue(QUEUE_NAME, {
  connection: getRedisConnection(),
});
