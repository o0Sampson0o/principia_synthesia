// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useKeyboardNavContext } from "@/components/TimelineKeyboardNav";
import TimelineKeyboardNav from "@/components/TimelineKeyboardNav";

function FakeCard({ index, label }: { index: number; label: string }) {
  const { focusIndex, registerRef } = useKeyboardNavContext();
  return (
    <div
      ref={(el) => registerRef(index, el)}
      tabIndex={focusIndex === index ? 0 : -1}
      aria-current={focusIndex === index ? "true" : undefined}
      data-testid={`card-${index}`}
      data-focused={focusIndex === index ? "true" : "false"}
    >
      {label}
    </div>
  );
}

describe("TimelineKeyboardNav", () => {
  it("renders children without errors", () => {
    const { getByTestId } = render(
      <TimelineKeyboardNav count={3}>
        <FakeCard index={0} label="Event A" />
        <FakeCard index={1} label="Event B" />
        <FakeCard index={2} label="Event C" />
      </TimelineKeyboardNav>
    );
    expect(getByTestId("card-0")).toBeTruthy();
  });

  it("starts with no card focused (focusIndex = -1)", () => {
    const { getByTestId } = render(
      <TimelineKeyboardNav count={3}>
        <FakeCard index={0} label="Event A" />
        <FakeCard index={1} label="Event B" />
      </TimelineKeyboardNav>
    );
    expect(getByTestId("card-0").dataset.focused).toBe("false");
    expect(getByTestId("card-1").dataset.focused).toBe("false");
  });

  it("ArrowDown increments focusIndex", () => {
    const { container, getByTestId } = render(
      <TimelineKeyboardNav count={3}>
        <FakeCard index={0} label="Event A" />
        <FakeCard index={1} label="Event B" />
        <FakeCard index={2} label="Event C" />
      </TimelineKeyboardNav>
    );
    const wrapper = container.firstChild as HTMLElement;
    fireEvent.keyDown(wrapper, { key: "ArrowDown" });
    expect(getByTestId("card-0").dataset.focused).toBe("true");
    fireEvent.keyDown(wrapper, { key: "ArrowDown" });
    expect(getByTestId("card-1").dataset.focused).toBe("true");
  });

  it("ArrowUp decrements focusIndex and does not go below 0", () => {
    const { container, getByTestId } = render(
      <TimelineKeyboardNav count={3}>
        <FakeCard index={0} label="Event A" />
        <FakeCard index={1} label="Event B" />
      </TimelineKeyboardNav>
    );
    const wrapper = container.firstChild as HTMLElement;
    fireEvent.keyDown(wrapper, { key: "ArrowDown" });
    fireEvent.keyDown(wrapper, { key: "ArrowDown" });
    expect(getByTestId("card-1").dataset.focused).toBe("true");
    fireEvent.keyDown(wrapper, { key: "ArrowUp" });
    expect(getByTestId("card-0").dataset.focused).toBe("true");
    fireEvent.keyDown(wrapper, { key: "ArrowUp" });
    expect(getByTestId("card-0").dataset.focused).toBe("true");
  });

  it("Home jumps to first card", () => {
    const { container, getByTestId } = render(
      <TimelineKeyboardNav count={3}>
        <FakeCard index={0} label="Event A" />
        <FakeCard index={1} label="Event B" />
        <FakeCard index={2} label="Event C" />
      </TimelineKeyboardNav>
    );
    const wrapper = container.firstChild as HTMLElement;
    fireEvent.keyDown(wrapper, { key: "ArrowDown" });
    fireEvent.keyDown(wrapper, { key: "ArrowDown" });
    fireEvent.keyDown(wrapper, { key: "Home" });
    expect(getByTestId("card-0").dataset.focused).toBe("true");
  });

  it("End jumps to last card", () => {
    const { container, getByTestId } = render(
      <TimelineKeyboardNav count={3}>
        <FakeCard index={0} label="Event A" />
        <FakeCard index={1} label="Event B" />
        <FakeCard index={2} label="Event C" />
      </TimelineKeyboardNav>
    );
    const wrapper = container.firstChild as HTMLElement;
    fireEvent.keyDown(wrapper, { key: "End" });
    expect(getByTestId("card-2").dataset.focused).toBe("true");
  });

  it("does not exceed the last card on repeated ArrowDown", () => {
    const { container, getByTestId } = render(
      <TimelineKeyboardNav count={2}>
        <FakeCard index={0} label="Event A" />
        <FakeCard index={1} label="Event B" />
      </TimelineKeyboardNav>
    );
    const wrapper = container.firstChild as HTMLElement;
    fireEvent.keyDown(wrapper, { key: "ArrowDown" });
    fireEvent.keyDown(wrapper, { key: "ArrowDown" });
    fireEvent.keyDown(wrapper, { key: "ArrowDown" });
    expect(getByTestId("card-1").dataset.focused).toBe("true");
    expect(getByTestId("card-0").dataset.focused).toBe("false");
  });

  it("calls onFocusIndexChange when focusIndex changes", () => {
    const onChange = vi.fn();
    const { container } = render(
      <TimelineKeyboardNav count={2} onFocusIndexChange={onChange}>
        <FakeCard index={0} label="Event A" />
        <FakeCard index={1} label="Event B" />
      </TimelineKeyboardNav>
    );
    const wrapper = container.firstChild as HTMLElement;
    fireEvent.keyDown(wrapper, { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith(0);
  });
});
