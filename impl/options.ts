import { dirname, resolve } from "std/path/mod.ts";

if (Deno.args.length != 1) {
  console.log("require config");
  Deno.exit();
}

interface DownloadOptions {
  max_size: number;
}

interface Options {
  output: string;
  channels: string[];
  cache: string;
  download: Record<"photo" | "document", DownloadOptions>;
}

export default JSON.parse(await Deno.readTextFile(Deno.args[0])) as Options;

const parent = dirname(resolve(Deno.args[0]));
Deno.chdir(parent);
