import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "v1";

function keyBytes(): Buffer {
  const raw = process.env.SHARE_TOKEN_ENC_KEY;
  if (!raw) throw new Error("share_key_missing");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("share_key_missing");
  return key;
}

export function encryptShareToken(token: string, linkId: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  cipher.setAAD(Buffer.from(`share_links:${linkId}`));
  const ciphertext = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}.${iv.toString("base64url")}.${Buffer.concat([ciphertext, tag]).toString("base64url")}`;
}

export function decryptShareToken(payload: string, linkId: string): string {
  const [version, ivPart, bodyPart] = payload.split(".");
  if (version !== PREFIX || !ivPart || !bodyPart) throw new Error("share_cipher_invalid");
  const body = Buffer.from(bodyPart, "base64url");
  if (body.length < 17) throw new Error("share_cipher_invalid");
  const tag = body.subarray(body.length - 16);
  const ciphertext = body.subarray(0, body.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), Buffer.from(ivPart, "base64url"));
  decipher.setAAD(Buffer.from(`share_links:${linkId}`));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
