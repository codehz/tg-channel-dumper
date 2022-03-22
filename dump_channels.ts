import options from "./impl/options.ts";
import { cache, output } from "./impl/db.ts";

const outdb = output(options.output);
outdb.execute("BEGIN");

import proto from "./impl/client.ts";
import type api from "mtproto/gen/api.js";

function updateMessage(channel: bigint, msg: api.Message) {
  outdb.execute
    `INSERT OR REPLACE INTO messages (chat_id, msg_id, content) VALUES (
      ${channel}, ${msg.id}, ${JSON.stringify(msg)}
    )`;
}

function processUpdates(channel: bigint, update: api.Update) {
  switch (update._) {
    case "updateEditChannelMessage":
      updateMessage(channel, update.message);
      break;
    case "updateDeleteChannelMessages":
      for (const id of update.messages) {
        outdb.execute`DELETE FROM messages
          WHERE chat_id = ${channel} AND msg_id = ${id}`;
      }
      break;
    case "updateChannelMessageViews":
      outdb.execute`UPDATE OR IGNORE messages
        SET content = json_set(content, '$.views', ${update.views})
        WHERE chat_id = ${channel} AND msg_id = ${update.id}`;
      break;
    case "updateChannelMessageForwards":
      outdb.execute`UPDATE OR IGNORE messages
        SET content = json_set(content, '$.forwards', ${update.forwards})
        WHERE chat_id = ${channel} AND msg_id = ${update.id}`;
      break;
    case "updatePinnedChannelMessages": {
      const patch = JSON.stringify({ pinned: update.pinned ?? null });
      for (const id of update.messages) {
        outdb.execute`UPDATE OR IGNORE messages
          SET content = json_patch(content, ${patch})
          WHERE chat_id = ${channel} AND msg_id = ${id}`;
      }
      break;
    }
    default:
      console.warn("unknown update", update._);
  }
}

function writeUpdates(
  channel: bigint,
  messages: api.Message[],
  users: api.User[],
  chats: api.Chat[],
) {
  for (const user of users) {
    outdb.execute`INSERT OR REPLACE INTO users (id, content) VALUES (
      ${user.id}, ${JSON.stringify(user)}
    )`;
  }
  for (const chat of chats) {
    outdb.execute`INSERT OR REPLACE INTO chats (id, content) VALUES (
      ${chat.id}, ${JSON.stringify(chat)}
    )`;
  }
  for (const msg of messages) {
    updateMessage(channel, msg);
  }
}

try {
  const rpc = await proto.rpc();
  for (const channel of options.channels) {
    const [[hash]] = cache.queryArray<[number | bigint]>
      `SELECT access_hash FROM chats WHERE id = ${channel}`;
    const info = (await rpc.api.channels.getFullChannel({
      channel: {
        _: "inputChannel",
        channel_id: BigInt(channel),
        access_hash: BigInt(hash),
      },
    })).unwrap();
    if (info.full_chat._ != "channelFull" || info.chats[0]._ != "channel") {
      throw new Error("invalid chat");
    }
    const title = info.chats[0].title;
    const latest = info.full_chat.pts;
    const about = info.full_chat.about;
    const exists = outdb.queryArray<[number]>
      `SELECT pts FROM channels WHERE id = ${channel}`;
    outdb.execute
      `INSERT OR REPLACE INTO channels (id, title, about, pts) VALUES (${channel}, ${title}, ${about}, ${latest})`;
    if (exists.length > 0) {
      const lastpts = exists[0][0];
      if (lastpts == latest) {
        console.log("skipped ", channel);
        continue;
      }
      const updates = (await rpc.api.updates.getChannelDifference({
        force: true,
        channel: {
          _: "inputChannel",
          access_hash: BigInt(hash),
          channel_id: BigInt(channel),
        },
        filter: {
          _: "channelMessagesFilterEmpty",
        },
        limit: 10000,
        pts: lastpts,
      })).unwrap();
      if (updates._ == "updates.channelDifferenceEmpty") continue;
      if (updates._ == "updates.channelDifference") {
        writeUpdates(
          BigInt(channel),
          updates.new_messages,
          updates.users,
          updates.chats,
        );
        for (const update of updates.other_updates) {
          processUpdates(BigInt(channel), update);
        }
        continue;
      }
      console.warn("too many updates, starting from scratch");
    }
    let remain: null | number = null;
    let add_offset = 0;
    while (remain == null || remain > 0) {
      const hist = (await rpc.api.messages.getHistory({
        peer: {
          _: "inputPeerChannel",
          channel_id: BigInt(channel),
          access_hash: BigInt(hash),
        },
        offset_id: 0,
        offset_date: 0,
        add_offset,
        limit: 100,
        max_id: 0,
        min_id: 0,
        hash: 0n,
      })).unwrap();
      if (hist._ != "messages.channelMessages") {
        throw new Error("invalid message");
      }
      if (hist.messages.length == 0) break;
      if (remain == null) remain = hist.count;
      remain -= hist.messages.length;
      writeUpdates(
        BigInt(channel),
        hist.messages,
        hist.users,
        hist.chats,
      );
      add_offset += hist.messages.length;
    }
  }
  outdb.execute("COMMIT");
} finally {
  await proto.shutdown();
}
