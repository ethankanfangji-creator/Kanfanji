// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { HouseReadout } from "@/components/house/HouseReadout";

afterEach(() => {
  cleanup();
});

describe("HouseReadout", () => {
  it("shows the address, an unrecorded status, and an empty card list", () => {
    render(<HouseReadout address="台北市松山區一號" cards={[]} />);

    expect(screen.getByRole("heading", { name: "台北市松山區一號" })).toBeInTheDocument();
    expect(screen.getByText("尚未記錄")).toBeInTheDocument();
    expect(screen.getByText("還沒有看點卡")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows a recorded status and each card status", () => {
    render(
      <HouseReadout
        address="台北市松山區一號"
        cards={[{ id: "card-1", status: "good", notes: "採光夠" }]}
      />,
    );

    expect(screen.getByText("已記錄 1 張看點卡")).toBeInTheDocument();
    expect(screen.getByText("不錯")).toBeInTheDocument();
    expect(screen.getByText("採光夠")).toBeInTheDocument();
    expect(screen.queryByText("還沒有看點卡")).toBeNull();
  });
});
