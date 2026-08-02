import "server-only";
import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";

const KEY_LENGTH = 64;
const SCRYPT_OPTIONS: ScryptOptions = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key);
    });
  });
}

export function assertAdminPassword(password: string): void {
  if (password.length < 12 || password.length > 128) {
    throw new Error("운영자 비밀번호는 12자 이상 128자 이하여야 합니다.");
  }
}

export async function hashAdminPassword(password: string): Promise<string> {
  assertAdminPassword(password);
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyAdminPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [algorithm, saltHex, keyHex] = encoded.split("$");
  if (
    algorithm !== "scrypt" ||
    !saltHex ||
    !keyHex ||
    keyHex.length !== KEY_LENGTH * 2
  ) {
    return false;
  }

  const expected = Buffer.from(keyHex, "hex");
  const actual = await deriveKey(password, Buffer.from(saltHex, "hex"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
