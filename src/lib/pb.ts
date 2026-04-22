/**
 * Typed PocketBase client wrapper.
 *
 * Wraps the official `pocketbase` SDK so that .collection(name) returns a
 * RecordService strongly typed against the per-collection record interface
 * generated from src/lib/core/schema.ts.
 *
 * The frontend should always go through `pb()`/`collection()` rather than
 * touching the raw SDK so that a schema change at the manifest level is
 * caught at compile time anywhere it's consumed.
 */

import PocketBase, { type RecordService } from "pocketbase";
import type {
  CollectionName,
  CollectionRecordMap,
} from "./core/records.js";

let _client: PocketBase | null = null;

export const PB_URL_DEFAULT = "/";

export function pb(url: string = PB_URL_DEFAULT): PocketBase {
  if (_client && _client.baseUrl === url) return _client;
  _client = new PocketBase(url);
  return _client;
}

export function resetPocketBaseClient(): void {
  _client = null;
}

export function collection<K extends CollectionName>(
  name: K,
  client: PocketBase = pb(),
): RecordService<CollectionRecordMap[K]> {
  return client.collection(name) as RecordService<CollectionRecordMap[K]>;
}
