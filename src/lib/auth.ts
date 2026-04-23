/**
 * Auth helpers built on top of the typed PocketBase wrapper.
 *
 * Functions accept an optional PocketBase instance so integration tests
 * can target a per-test server while production code uses the singleton
 * from src/lib/pb.ts. PB persists the auth state in localStorage, so
 * page loads automatically restore the session.
 */

import type PocketBase from "pocketbase";
import type { PlayersRecord } from "./core/records.js";
import { collection, pb } from "./pb.js";

export interface AuthResult {
  user: PlayersRecord;
  token: string;
}

export async function signup(
  nickname: string,
  passcode: string,
  client: PocketBase = pb(),
): Promise<AuthResult> {
  await collection("players", client).create({
    nickname,
    password: passcode,
    passwordConfirm: passcode,
    level: 1,
  } as unknown as Partial<PlayersRecord>);
  return login(nickname, passcode, client);
}

export async function login(
  nickname: string,
  passcode: string,
  client: PocketBase = pb(),
): Promise<AuthResult> {
  const auth = await collection("players", client).authWithPassword(
    nickname,
    passcode,
  );
  return { user: auth.record, token: auth.token };
}

export function logout(client: PocketBase = pb()): void {
  client.authStore.clear();
}

export function currentUser(client: PocketBase = pb()): PlayersRecord | null {
  return (client.authStore.record as PlayersRecord | null) ?? null;
}

export function isAuthenticated(client: PocketBase = pb()): boolean {
  return client.authStore.isValid;
}
