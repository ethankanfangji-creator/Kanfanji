// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import LandingPage from "./page";

afterEach(() => {
  cleanup();
});

describe("landing page", () => {
  it("shows the five sections and no invented prices or reviews", () => {
    render(<LandingPage />);

    expect(
      screen.getByRole("heading", { name: "看房時一張一張記下重點，看完再把幾間房放在一起比。" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "現場看點卡" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "看完對比" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "現有方案" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "登入" })).toHaveAttribute("href", "/login");
    expect(screen.getByText("3 間看房紀錄")).toBeInTheDocument();
    expect(screen.getByText("比較 1 次，最多 2 間")).toBeInTheDocument();
    expect(screen.getByText("比較次數不限，每次最多 5 間")).toBeInTheDocument();
    expect(screen.queryByText(/6\.99|12\.99|Couple|評價/)).toBeNull();
  });

  it("leaves the home page on the viewing app", () => {
    const home = readFileSync("app/page.tsx", "utf8");
    expect(home).toContain("ViewingChatApp");
    expect(home).not.toContain("landing");
  });
});
