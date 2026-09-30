import { randomBytes } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function isLiveCode(value: string): boolean {
  return new RegExp(`^[${ALPHABET}]{6}$`).test(value);
}

export function createSessionCode(bytes: Buffer = randomBytes(6)): string {
  if (bytes.length < 6) throw new Error("not enough random bytes");
  let code = "";
  for (let index = 0; index < 6; index += 1) {
    code += ALPHABET[bytes[index] % ALPHABET.length];
  }
  return code;
}
