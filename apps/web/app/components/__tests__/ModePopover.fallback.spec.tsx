/** @jest-environment jsdom */

import "@testing-library/jest-dom";
import { fireEvent, render } from "@testing-library/react";
import { ModePopover } from "@/app/components/diagnostics/ModePopover";
import { forceRecomputeGlobalMeta } from "@/app/state/globalModeStore";

jest.mock("@/app/state/globalModeStore", () => ({
  forceRecomputeGlobalMeta: jest.fn(),
}));

describe("ModePopover fallback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders unavailable hint and triggers recompute", () => {
    const { getByText } = render(<ModePopover meta={null} />);
    const disabledLabel = getByText("诊断未就绪");
    expect(disabledLabel).toBeInTheDocument();
    expect(disabledLabel.closest('[data-qa="mode-popover-unavailable"]')).not.toBeNull();

    const button = getByText("重试计算");
    fireEvent.click(button);
    expect(forceRecomputeGlobalMeta).toHaveBeenCalledTimes(1);
  });
});
