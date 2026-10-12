import fs from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";

export class LocalFileService {
  private readonly directory = path.resolve(process.cwd(), "exports");

  async upload(stream: PassThrough, fileName: string): Promise<string> {
    await fs.promises.mkdir(this.directory, {
      recursive: true,
    });

    const filePath = path.join(this.directory, fileName);

    const output = fs.createWriteStream(filePath);

    stream.pipe(output);

    await new Promise<void>((resolve, reject) => {
      output.once("finish", resolve);

      output.once("error", reject);

      stream.once("error", reject);
    });

    return filePath;
  }
}
