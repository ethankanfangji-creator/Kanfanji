import { describe, expect, it } from "vitest";
import { accountFaceFromUser } from "./account-face";
import type { User } from "@supabase/supabase-js";

function user(partial: Partial<User> & { id: string }): User {
  return {
    app_metadata: {},
    aud: "authenticated",
    created_at: "",
    identities: [],
    user_metadata: {},
    ...partial,
  } as User;
}

describe("accountFaceFromUser", () => {
  it("prefers full_name and avatar_url", () => {
    expect(
      accountFaceFromUser(
        user({
          id: "u1",
          email: "a@example.com",
          user_metadata: {
            full_name: "Ada Lovelace",
            avatar_url: "https://cdn.example/a.png",
          },
        }),
      ),
    ).toEqual({
      label: "Ada Lovelace",
      avatarUrl: "https://cdn.example/a.png",
    });
  });

  it("falls back to email local part", () => {
    expect(
      accountFaceFromUser(user({ id: "u1", email: "bob@example.com" })),
    ).toEqual({ label: "bob", avatarUrl: null });
  });
});
