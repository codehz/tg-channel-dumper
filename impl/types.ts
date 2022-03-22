import { ToUnderscore } from "mtproto/tl/types.ts";

export type BigIntInput = string | number | bigint

export type PhotoSize = {
  type?: string;
  w?: number;
  h?: number;
  size?: number;
  bytes?: string;
};

export type Photo = {
  _: "photo";
  id: string;
  access_hash: string | number;
  file_reference: string;
  sizes: PhotoSize[];
  dc_id: number;
};

export type Document = {
  id: string;
  access_hash: string;
  file_reference: string;
  date: number;
  mime_type: string;
  size: number;
  dc_id: number;
};

export type _MessageMedia = {
  messageMediaPhoto: {
    photo: Photo;
  };
  messageMediaDocument: {
    document: Document;
  };
};

export type MessageMedia<K extends keyof _MessageMedia = keyof _MessageMedia> =
  ToUnderscore<_MessageMedia, K>;
