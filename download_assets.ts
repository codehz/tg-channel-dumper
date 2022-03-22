import options from "./impl/options.ts";

if (options.download.photo?.max_size == null) throw new Error("no max size");

const max_photo_size = options.download.photo.max_size;

import { output } from "./impl/db.ts";
import type { ChatPhoto, Photo, UserProfilePhoto } from "./impl/types.ts";
import proto from "./impl/client.ts";
import { decode } from "std/encoding/base64.ts";
import FileDownloader from "./impl/downloader.ts";

const outdb = output(options.output);

const query_messages = outdb.prepare(`SELECT
  chat_id,
  msg_id,
  content->'$.media.photo' as photo
  FROM messages
  WHERE content->>'$.media.photo._' = 'photo'
  ORDER BY chat_id, msg_id DESC`);

const query_chats = outdb.prepare(`SELECT
  id,
  content->>'$.access_hash' as hash,
  content->'$.photo' as photo
  FROM chats
  WHERE content->>'$.photo._' = 'chatPhoto'
  ORDER BY id
`);

const query_users = outdb.prepare(`SELECT
  id,
  content->>'$.access_hash' as hash,
  content->'$.photo' as photo
  FROM users
  WHERE content->>'$.photo._' = 'userProfilePhoto'
  ORDER BY id
`);

const downloader = new FileDownloader(outdb);

try {
  let row;
  while (row = query_messages.step()) {
    const [chat_id, msg_id, photo] = row
      .asArray<[string, number, string]>();
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
        await downloader.download_photo(
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

  while (row = query_chats.step()) {
    const [id, hash, photo] = row.asArray<[string, string, string]>();
    const { photo_id, dc_id } = JSON.parse(photo) as ChatPhoto;
    await downloader.download_profile_photo(
      {
        _: "inputPeerChannel",
        channel_id: BigInt(id),
        access_hash: BigInt(hash),
      },
      BigInt(photo_id),
      dc_id,
    );
  }

  while (row = query_users.step()) {
    const [id, hash, photo] = row.asArray<[string, string, string]>();
    const { photo_id, dc_id } = JSON.parse(photo) as UserProfilePhoto;
    await downloader.download_profile_photo(
      {
        _: "inputPeerUser",
        user_id: BigInt(id),
        access_hash: BigInt(hash),
      },
      BigInt(photo_id),
      dc_id,
    );
  }
} finally {
  query_messages.finalize();
  query_chats.finalize();
  await proto.shutdown();
}
