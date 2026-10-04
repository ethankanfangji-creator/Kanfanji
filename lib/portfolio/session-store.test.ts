// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
  createPortfolioSession,
  deletePortfolioSession,
  listPortfolioSessions,
  titleFromTurns,
  upsertPortfolioSession,
} from "./session-store";

describe("portfolio session store", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates, lists, updates, and deletes sessions", () => {
    const created = createPortfolioSession({
      turns: [
        {
          id: "11111111-1111-4111-8111-111111111111",
          role: "user",
          text: "哪幾間採光好？",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    expect(created.title).toContain("採光");
    expect(listPortfolioSessions()).toHaveLength(1);

    const updated = upsertPortfolioSession({
      ...created,
      turns: [
        ...created.turns,
        {
          id: "22222222-2222-4222-8222-222222222222",
          role: "assistant",
          text: "兩間",
          createdAt: new Date().toISOString(),
        },
      ],
    });
    expect(updated.turns).toHaveLength(2);
    expect(titleFromTurns(updated.turns)).toContain("採光");

    deletePortfolioSession(created.id);
    expect(listPortfolioSessions()).toHaveLength(0);
  });
});
