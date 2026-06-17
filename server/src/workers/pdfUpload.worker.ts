import fs from "fs";
import { Worker } from "bullmq";
import { QUEUE_NAME } from "../config/queue";
import { getRedisConnection } from "../config/redis";
import { WORKER_CONCURRENCY } from "../config/rag.constants";
import { ingestPdf } from "../services/pdfIngestion.service";
import { PdfUploadJobData } from "../types/job.types";

export function startPdfUploadWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      try {
        return await ingestPdf(job.data as PdfUploadJobData);
      } catch (error) {
        console.error("Error processing PDF:", error);
        throw error;
      }
    },
    {
      concurrency: WORKER_CONCURRENCY,
      connection: getRedisConnection(),
    }
  );

  worker.on("error", (err) => {
    console.error("Worker error:", err);
  });

  worker.on("failed", (job, err) => {
    console.error(
      `Worker failed processing job ${job?.id} with error: ${err.message}`
    );

    const attemptsRemaining =
      (job?.opts?.attempts ?? 1) - (job?.attemptsMade ?? 1);
    if (attemptsRemaining <= 0 && job?.data?.path) {
      try {
        if (fs.existsSync(job.data.path)) {
          fs.unlinkSync(job.data.path);
          console.log(
            `Cleaned up file after all retries exhausted: ${job.data.path}`
          );
        }
      } catch (cleanupError) {
        console.error("Error during final cleanup:", cleanupError);
      }
    }
  });

  worker.on("completed", (job, result) => {
    console.log(`Job ${job.id} completed:`, result);
  });

  return worker;
}
