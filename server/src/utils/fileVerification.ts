import fs from "fs";
import { FILE_VERIFY_MAX_ATTEMPTS } from "../config/rag.constants";

export async function waitForStableFile(filePath: string): Promise<void> {
  let fileExists = false;
  let attempts = 0;

  while (!fileExists && attempts < FILE_VERIFY_MAX_ATTEMPTS) {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      if (stats.size > 0) {
        await new Promise((resolve) => setTimeout(resolve, 200));

        const newStats = fs.statSync(filePath);
        if (newStats.size === stats.size) {
          fileExists = true;
          console.log(
            `File verified on attempt ${attempts + 1}: ${filePath} (${stats.size} bytes)`
          );
        } else {
          console.log(`File still being written, attempt ${attempts + 1}`);
        }
      } else {
        console.log(`File is empty on attempt ${attempts + 1}`);
      }
    } else {
      console.log(`File does not exist on attempt ${attempts + 1}: ${filePath}`);
    }

    if (!fileExists) {
      attempts++;
      if (attempts < FILE_VERIFY_MAX_ATTEMPTS) {
        console.log("Waiting 1 second before retry...");
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  if (!fileExists) {
    throw new Error(
      `File not found after ${FILE_VERIFY_MAX_ATTEMPTS} attempts: ${filePath}`
    );
  }
}
