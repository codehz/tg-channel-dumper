import MTProto from "mtproto";
import factory from "mtproto/transport/connection/deno-tcp.ts";
import Abridged from "mtproto/transport/codec/abridged.ts";
import JsonDB from "mtproto/storage/jsondb.ts";

const db = new JsonDB("storage.json");

export default new MTProto({
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
});