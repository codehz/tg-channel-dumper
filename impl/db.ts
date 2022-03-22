import { encode } from "std/encoding/base64.ts";

// @ts-ignore
BigInt.prototype.toJSON = function () {
  return this.toString();
};
// @ts-ignore
Uint8Array.prototype.toJSON = function () {
  return encode(this);
}

import { Database } from "sqlite3";

export const cache = new Database("cache.db");

cache.execute(`
CREATE TABLE IF NOT EXISTS chats(
  id INT PRIMARY KEY,
  access_hash INT
)
`);

export function output(name: string) {
  const ret = new Database(name);
  ret.execute`CREATE TABLE IF NOT EXISTS channels(
    id INT PRIMARY KEY,
    title TEXT,
    about TEXT,
    pts INT
  )`;
  ret.execute`CREATE TABLE IF NOT EXISTS chats(
    id INT PRIMARY KEY,
    content TEXT
  )`;
  ret.execute`CREATE TABLE IF NOT EXISTS users(
    id INT PRIMARY KEY,
    content TEXT
  )`;
  ret.execute`CREATE TABLE IF NOT EXISTS messages(
    chat_id INT NOT NULL,
    msg_id INT NOT NULL,
    content TEXT,
    PRIMARY KEY(chat_id, msg_id)
  )`;
  return ret;
}
