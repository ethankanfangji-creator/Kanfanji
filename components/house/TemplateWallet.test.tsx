// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SYSTEM_CARD_TEMPLATE_NAMES } from "@/lib/viewing-card-templates";
import { TemplateWallet } from "./TemplateWallet";

vi.mock("@/app/house/template-actions", () => ({
  addOwnCardTemplate: vi.fn(async () => ({
    template: {
      id: "own-1",
      name: "自家廚房",
      icon: "🍳",
      sortOrder: 12,
      isSystem: false,
    },
  })),
}));

const systemTemplates = SYSTEM_CARD_TEMPLATE_NAMES.map((name, index) => ({
  id: `system-${index + 1}`,
  name,
  icon: "✨",
  sortOrder: index + 1,
  isSystem: true,
}));

afterEach(() => {
  cleanup();
});

describe("TemplateWallet", () => {
  it("stacks the eleven system cards and does not turn their names into fields", () => {
    const { container } = render(
      <TemplateWallet viewingId="11111111-1111-4111-8111-111111111111" templates={systemTemplates} />,
    );

    for (const name of SYSTEM_CARD_TEMPLATE_NAMES) {
      expect(screen.getByText(name)).toBeInTheDocument();
      expect(screen.queryByDisplayValue(name)).toBeNull();
    }
    const cards = container.querySelectorAll("ul > li");
    expect(cards).toHaveLength(11);
    expect(cards[0]?.className).not.toContain("-mt-2");
    expect(cards[1]?.className).toContain("-mt-2");
    expect(cards[1]?.className).toContain("rounded-2xl");
    expect(container.querySelector(".grid")).toBeNull();
  });

  it("adds a personal card onto the same stack", async () => {
    const user = userEvent.setup();
    render(<TemplateWallet viewingId="11111111-1111-4111-8111-111111111111" templates={systemTemplates} />);
    await user.type(screen.getByLabelText("名稱"), "自家廚房");
    await user.type(screen.getByLabelText("一個 emoji"), "🍳");
    await user.click(screen.getByRole("button", { name: "新增看點卡" }));
    expect(await screen.findByText("自家廚房")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
  });
});
