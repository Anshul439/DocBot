import type { ConnectionOptions } from "bullmq";

export function getRedisConnection(): ConnectionOptions {
  return {
    username: "default",
    password: process.env.REDIS_PASSWORD,
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
    tls: {
      rejectUnauthorized: false,
    },
  };
}
