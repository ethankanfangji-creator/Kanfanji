// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ViewingTagsPicker } from "./ViewingTagsPicker";

afterEach(cleanup);

const labels = {
  label: "Tags",
  placeholder: "Add a tag…",
  frequent: "Frequent",
  addAria: "Add tag",
};

describe("ViewingTagsPicker", () => {
  it("shows frequent tags in the input dropdown, not a separate chip row", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ViewingTagsPicker
        value={[]}
        labels={labels}
        frequentTags={["太吵", "候補"]}
        onChange={onChange}
      />,
    );

    expect(screen.queryByPlaceholderText("Add a tag…")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add tag" }));
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("listbox", { name: "Frequent" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "太吵" })).toBeInTheDocument();

    await user.click(screen.getByRole("option", { name: "太吵" }));
    expect(onChange).toHaveBeenLastCalledWith(["太吵"]);

    rerender(
      <ViewingTagsPicker
        value={["太吵"]}
        labels={labels}
        frequentTags={["太吵", "候補"]}
        onChange={onChange}
      />,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "太吵" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "候補" })).toBeInTheDocument();

    await user.type(screen.getByRole("combobox"), "採光好{Enter}");
    expect(onChange).toHaveBeenLastCalledWith(["太吵", "採光好"]);

    await user.click(screen.getByRole("button", { name: "Tags: 太吵" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
