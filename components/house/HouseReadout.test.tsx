// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { HouseReadout } from "@/components/house/HouseReadout";

afterEach(() => {
  cleanup();
});

describe("HouseReadout", () => {
  it("shows the address and an unrecorded status", () => {
    const { container } = render(<HouseReadout address="台北市松山區一號" />);

    expect(screen.getByRole("heading", { name: "台北市松山區一號" })).toBeInTheDocument();
    expect(screen.getByText("這間還沒有看點紀錄。")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("bg-[#FAF6F1]");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
