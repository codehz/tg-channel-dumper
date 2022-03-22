import proto from "./impl/client.ts";
import { Table } from "cliffy/table/mod.ts";
import { cache } from "./impl/db.ts";

try {
  const rpc = await proto.rpc();

  const { chats } = (await rpc.api.messages.getAllChats({ except_ids: [] }))
    .unwrap();

  const table = new Table().header(["id", "username", "title"]);

  const insert = cache.prepare(
    "INSERT OR REPLACE INTO chats (id, access_hash) VALUES (?, ?)",
  );
  cache.execute("BEGIN");
  for (const chat of chats) {
    if (chat._ == "channel") {
      if (chat.access_hash) {
        insert.execute(chat.id, chat.access_hash);
      }
      table.push([chat.id + "", chat.username ?? "(private)", chat.title]);
    }
  }
  cache.execute("COMMIT");
  insert.finalize();

  table.render();
} finally {
  proto.shutdown();
}
