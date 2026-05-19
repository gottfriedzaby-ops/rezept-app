/**
 * PR-F: a11y polish bundle — verifies each touched control has an
 * accessible name discoverable via testing-library's getByRole/getByLabelText.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import TagMergeToggle from "@/components/TagMergeToggle";
import PrivacyToggle from "@/components/PrivacyToggle";
import LibraryShareManager from "@/components/LibraryShareManager";

describe("a11y polish — switches have accessible names", () => {
  it("TagMergeToggle's role=switch button has an aria-label", () => {
    render(<TagMergeToggle initialValue={false} />);
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAccessibleName("Geteilte Rezepte in meiner Bibliothek anzeigen");
  });

  it("PrivacyToggle's role=switch button has an aria-label", () => {
    render(<PrivacyToggle recipeId="r1" initialIsPrivate={false} />);
    const sw = screen.getByRole("switch");
    expect(sw).toHaveAccessibleName("Rezept privat halten");
  });
});

describe("a11y polish — form inputs labelled", () => {
  it("LibraryShareManager invite email input is reachable via getByLabelText", () => {
    render(
      <LibraryShareManager initialShares={[]} reshareRequests={[]} />
    );

    const input = screen.getByLabelText("Einladung senden") as HTMLInputElement;
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input.type).toBe("email");
  });

  // RecipeList search-input a11y is covered in RecipeList.test.tsx where the
  // next/navigation mocks are already wired up.
});
