import options from "./impl/options.ts";

if (options.download.photo?.max_size == null) throw new Error("no max size");

const max_photo_size = options.download.photo.max_size;

import { output } from "./impl/db.ts";
import type { BigIntInput, Photo } from "./impl/types.ts";
import proto from "./impl/client.ts";
import { decode } from "std/encoding/base64.ts";
import FileDownloader from "./impl/downloader.ts";

const outdb = output(options.output);

const query = outdb.prepare(`SELECT
  chat_id,
  msg_id,
  content->'$.media.photo' as photo
  FROM messages
  WHERE content->'$.media.photo' is not null
  ORDER BY chat_id, msg_id DESC`);

const downloader = new FileDownloader(outdb);

try {
  let row;
  while (row = query.step()) {
    const [chat_id, msg_id, photo] = row
      .asArray<[BigIntInput, number, string]>();
    const msgphoto = JSON.parse(photo) as Photo;
    if (
      msgphoto._ == "photo" &&
      options.download.photo?.max_size != null
    ) {
      const sizes = msgphoto.sizes
        .filter((x) => x.size != null && x.type != null)
        .filter((x) => x.size! < max_photo_size) as Array<
          { type: string; size: number }
        >;
      sizes.sort((a, b) => b.size - a.size);
      if (sizes.length > 0) {
        const target_size = sizes[0];
        await downloader.download(
          BigInt(chat_id),
          +msg_id,
          BigInt(msgphoto.id),
          decode(msgphoto.file_reference),
          BigInt(msgphoto.access_hash),
          target_size.type,
          target_size.size,
          msgphoto.dc_id,
        );
      }
    }
  }
} finally {
  query.finalize();
  await proto.shutdown();
}
