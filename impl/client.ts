import MTProto from "mtproto";
import factory from "mtproto/transport/connection/deno-tcp.ts";
import Abridged from "mtproto/transport/codec/abridged.ts";
import JsonDB from "mtproto/storage/jsondb.ts";
import { toDCInfo } from "mtproto/common/dc.ts";

const db = new JsonDB("storage.json");

const client = new MTProto({
  api_id: 4,
  api_hash: "014b35b6184100b085b0d0572f9b5103",
  environment: {
    app_version: "8.6.1",
    device_model: "Unknown",
    system_version: "1.0.0",
  },
  initdc: {
    test: false,
    id: 1,
    ip: "149.154.175.53",
    port: 80,
  },
  ipv6_policy: "ipv4",
  transport_factory: factory(() => new Abridged()),
  storage: db,
  setup_rpc(rpc) {
    const info = toDCInfo(rpc.dcid);
    console.log("setup", info);
    if (info.type != "main" || info.id == client.default_dc) return;
    rpc.on("authorize", (e) => {
      console.log("require auth for", info);
      e.resolve = (async () => {
        const native = await client.rpc();
        const auth =
          (await native.api.auth.exportAuthorization({ dc_id: info.id }))
            .unwrap();
        (await rpc.api.auth.importAuthorization(auth)).unwrap();
      })();
    });
  },
});

await client.init();

export default client;
