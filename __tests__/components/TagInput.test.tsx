import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import TagInput from "@/components/TagInput";

/** Renders a TagInput with a small wrapper that tracks the controlled value. */
function ControlledHarness({
  initial = [],
  disabled = false,
  placeholder,
  onChangeSpy,
}: {
  initial?: string[];
  disabled?: boolean;
  placeholder?: string;
  onChangeSpy?: (tags: string[]) => void;
}) {
  const [tags, setTags] = React.useState<string[]>(initial);
  return (
    <TagInput
      value={tags}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(next) => {
        setTags(next);
        onChangeSpy?.(next);
      }}
    />
  );
}

function getInput(): HTMLInputElement {
  return screen.getByRole("textbox") as HTMLInputElement;
}

describe("TagInput component", () => {
  // TI-01
  it("renders existing tags as pills", () => {
    render(<ControlledHarness initial={["vegetarisch", "schnell"]} />);

    expect(screen.getByText("vegetarisch")).toBeInTheDocument();
    expect(screen.getByText("schnell")).toBeInTheDocument();
  });

  // TI-02
  it("× button removes a tag and calls onChange with the updated list", () => {
    const onChange = jest.fn();
    render(<ControlledHarness initial={["vegetarisch"]} onChangeSpy={onChange} />);

    fireEvent.click(screen.getByLabelText('Tag "vegetarisch" entfernen'));

    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(screen.queryByText("vegetarisch")).not.toBeInTheDocument();
  });

  // TI-03
  it("Enter key adds the typed tag", () => {
    const onChange = jest.fn();
    render(<ControlledHarness onChangeSpy={onChange} />);

    fireEvent.change(getInput(), { target: { value: "pasta" } });
    fireEvent.keyDown(getInput(), { key: "Enter" });

    expect(onChange).toHaveBeenLastCalledWith(["pasta"]);
    expect(getInput().value).toBe("");
  });

  // TI-04
  it("comma key adds the typed tag", () => {
    const onChange = jest.fn();
    render(<ControlledHarness onChangeSpy={onChange} />);

    fireEvent.change(getInput(), { target: { value: "pasta" } });
    fireEvent.keyDown(getInput(), { key: "," });

    expect(onChange).toHaveBeenLastCalledWith(["pasta"]);
  });

  // TI-05
  it("Backspace on empty input removes the last tag", () => {
    const onChange = jest.fn();
    render(<ControlledHarness initial={["vegetarisch", "schnell"]} onChangeSpy={onChange} />);

    getInput().focus();
    fireEvent.keyDown(getInput(), { key: "Backspace" });

    expect(onChange).toHaveBeenLastCalledWith(["vegetarisch"]);
  });

  // TI-06
  it("typing a duplicate tag (case-insensitive) does not add it", () => {
    const onChange = jest.fn();
    render(<ControlledHarness initial={["vegetarisch"]} onChangeSpy={onChange} />);
    onChange.mockClear();

    fireEvent.change(getInput(), { target: { value: "VEGETARISCH" } });
    fireEvent.keyDown(getInput(), { key: "Enter" });

    expect(onChange).not.toHaveBeenCalled();
    // Input is still cleared
    expect(getInput().value).toBe("");
  });

  // TI-07
  it("shows autocomplete suggestions for matching known tags", () => {
    render(<ControlledHarness />);

    getInput().focus();
    fireEvent.change(getInput(), { target: { value: "veg" } });

    // "vegetarisch" and "vegan" are both in the TAG_MAP and start with "veg"
    expect(screen.getByRole("button", { name: /vegetarisch/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /vegan/i })).toBeInTheDocument();
  });

  // TI-08
  it("clicking a suggestion adds the tag and clears the input", () => {
    const onChange = jest.fn();
    render(<ControlledHarness onChangeSpy={onChange} />);

    getInput().focus();
    fireEvent.change(getInput(), { target: { value: "veg" } });

    const suggestionBtn = screen.getByRole("button", { name: /vegetarisch/i });
    // Suggestions use onMouseDown rather than onClick to avoid blur stealing the event
    fireEvent.mouseDown(suggestionBtn);

    expect(onChange).toHaveBeenLastCalledWith(["vegetarisch"]);
    expect(getInput().value).toBe("");
  });

  // TI-09
  it("already-added tags are excluded from suggestions", () => {
    render(<ControlledHarness initial={["vegetarisch"]} />);

    getInput().focus();
    fireEvent.change(getInput(), { target: { value: "veg" } });

    // vegan should still appear (not yet added), vegetarisch should NOT appear in the dropdown
    expect(screen.getByRole("button", { name: /vegan/i })).toBeInTheDocument();
    // vegetarisch appears as a pill but not as a suggestion button — assert only one element
    // with that text exists (the pill, not a dropdown button)
    const matches = screen.getAllByText("vegetarisch");
    expect(matches).toHaveLength(1);
  });

  // TI-10
  it("disabled prop disables × buttons and the text input", () => {
    render(<ControlledHarness initial={["schnell"]} disabled />);

    const removeBtn = screen.getByLabelText('Tag "schnell" entfernen') as HTMLButtonElement;
    expect(removeBtn.disabled).toBe(true);
    expect(getInput().disabled).toBe(true);
  });

  // TI-11
  it("blur on a non-empty input commits the typed tag", () => {
    const onChange = jest.fn();
    render(<ControlledHarness onChangeSpy={onChange} />);

    fireEvent.change(getInput(), { target: { value: "pasta" } });
    fireEvent.blur(getInput());

    expect(onChange).toHaveBeenLastCalledWith(["pasta"]);
  });

  it("renders a live colour-preview pill while typing", () => {
    render(<ControlledHarness />);

    getInput().focus();
    fireEvent.change(getInput(), { target: { value: "neu" } });

    // The preview span has aria-hidden="true" and the same trimmed text
    const previewEls = screen.getAllByText("neu", { selector: "span" });
    expect(previewEls.length).toBeGreaterThan(0);
  });
});
