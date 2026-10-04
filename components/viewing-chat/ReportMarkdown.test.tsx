// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReportMarkdown } from "./ReportMarkdown";

afterEach(() => cleanup());

describe("ReportMarkdown", () => {
  it("renders headings, lists, and a What's stopping you section", () => {
    render(
      <ReportMarkdown
        text={`# 1167 Victory Drive

## 物業基本概況

土地約 **8,290 sq.ft.**

## What's stopping you?

- 未比成交價
- Zoning 未查
`}
      />,
    );
    expect(screen.getByText("1167 Victory Drive")).toBeTruthy();
    expect(screen.getByText("物業基本概況")).toBeTruthy();
    expect(screen.getByText(/What's stopping you/)).toBeTruthy();
    expect(screen.getByText("未比成交價")).toBeTruthy();
    expect(screen.getByText("8,290 sq.ft.")).toBeTruthy();
  });
});
