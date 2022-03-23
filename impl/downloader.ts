import options from "./options.ts";
import { join } from "std/path/mod.ts";
import { Database } from "sqlite3";
import { cache } from "./db.ts";
import proto from "./client.ts";
import RPC from "mtproto/rpc/mod.ts";
import type api from "mtproto/gen/api.js";
import { tou8 } from "mtproto/common/utils.ts";
import { writeAll } from "std/streams/conversion.ts";

const cachedir = options.cache;

await Deno.mkdir(cachedir, { recursive: true });

for await (const file of Deno.readDir(cachedir)) {
  if (!file.isFile) continue;
  if (file.name.endsWith(".download")) {
    await Deno.remove(join(cachedir, file.name));
  }
}

function encodeU64(int: bigint) {
  return BigInt.asUintN(64, int).toString(16).toUpperCase().padStart(16, "0");
}

async function wrap_download<T>(
  filename: string,
  info: string,
  cb: () => AsyncGenerator<Uint8Array, T>,
) {
  try {
    await Deno.lstat(filename);
    return;
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  const cache = await Deno.open(filename + ".download", {
    create: true,
    write: true,
    truncate: true,
  });
  let ret: T;
  try {
    console.log("download", filename);
    const iter = cb();
    let res;
    while (!(res = await iter.next()).done) {
      await writeAll(cache, res.value);
    }
    ret = res.value;
    cache.close();
  } catch (e) {
    cache.close();
    await Deno.remove(filename + ".download");
    throw new Error(`download aborted (${info})`, { cause: e });
  }
  await Deno.rename(filename + ".download", filename);
  return ret;
}

export default class FileDownloader {
  constructor(private db: Database) {}

  async #refresh_photo(
    rpc: RPC,
    chat_id: bigint,
    msg_id: number,
  ) {
    const [[hash]] = cache.queryArray<[number | bigint]>
      `SELECT access_hash FROM chats WHERE id = ${chat_id}`;
    const msg = (await rpc.api.channels.getMessages({
      channel: {
        _: "inputChannel",
        channel_id: chat_id,
        access_hash: BigInt(hash),
      },
      id: [{
        _: "inputMessageID",
        id: msg_id,
      }],
    })).unwrap();
    if (msg._ != "messages.channelMessages" || msg.messages[0]._ != "message") {
      throw new Error("unknown messages");
    }
    if (msg.messages[0].media == null) throw new Error("cannot fetch media");
    const media = msg.messages[0].media;
    if (media._ != "messageMediaPhoto") throw new Error("media type changed");
    if (media.photo == null || media.photo._ == "photoEmpty") {
      throw new Error("photo missing");
    }
    this.db.execute`UPDATE messages
      SET content = json_set(content, '$.media', json(${JSON.stringify(media)}))
      WHERE chat_id = ${chat_id} AND msg_id = ${msg_id}`;
    return tou8(media.photo.file_reference);
  }

  async download_photo(
    chat_id: bigint,
    msg_id: number,
    file_id: bigint,
    file_reference: Uint8Array,
    access_hash: bigint,
    type: string,
    size: number,
    dc: number,
  ) {
    const filename = join(cachedir, encodeU64(file_id));
    const self = this;
    await wrap_download(filename, `${chat_id}, ${msg_id}`, async function* () {
      const rpc = await proto.rpc(proto.get_dc_id(dc));
      let offset = 0;
      while (size - offset > 0) {
        const partres = (await rpc.api.upload.getFile({
          location: {
            _: "inputPhotoFileLocation",
            access_hash,
            file_reference,
            id: file_id,
            thumb_size: type,
          },
          limit: 65536,
          offset,
        }));
        if (!partres.ok) {
          if (partres.error.startsWith("FILE_REFERENCE_")) {
            file_reference = await self.#refresh_photo(rpc, chat_id, msg_id);
            continue;
          } else {
            throw new Error(partres.error);
          }
        }
        const part = partres.value;
        if (part._ == "upload.fileCdnRedirect") {
          throw new Error("TODO: cdn file");
        }
        const bytes = tou8(part.bytes);
        offset += bytes.byteLength;
        yield bytes;
      }
    });
  }

  async download_profile_photo(
    peer: api.InputPeer,
    photo_id: bigint,
    dc: number,
  ) {
    const filename = join(cachedir, "profile_" + encodeU64(photo_id));
    await wrap_download(
      filename,
      `${JSON.stringify(peer)}, profile ${photo_id}`,
      async function* () {
        const rpc = await proto.rpc(proto.get_dc_id(dc));
        let offset = 0;
        while (true) {
          const part = (await rpc.api.upload.getFile({
            location: {
              _: "inputPeerPhotoFileLocation",
              peer,
              photo_id,
              big: true,
            },
            limit: 65536,
            offset,
          })).unwrap();
          if (part._ == "upload.fileCdnRedirect") {
            throw new Error("TODO: cdn file");
          }
          const bytes = tou8(part.bytes);
          offset += bytes.byteLength;
          yield bytes;
          if (bytes.byteLength < 65536) break;
        }
      },
    );
  }
}
