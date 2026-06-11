import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ThemeToggle, { THEME_STORAGE_KEY } from "@/components/ThemeToggle";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  window.matchMedia = jest.fn().mockReturnValue({ matches: false });
});

describe("ThemeToggle", () => {
  it("renders the three options with System preselected", () => {
    render(<ThemeToggle />);
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByRole("radio", { name: "Hell" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Dunkel" })).toBeInTheDocument();
  });

  it("applies dark mode and persists the choice", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(screen.getByRole("radio", { name: "Dunkel" }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("switching back to System removes the stored preference", async () => {
    const user = userEvent.setup();
    localStorage.setItem(THEME_STORAGE_KEY, "dark");
    render(<ThemeToggle />);

    await user.click(screen.getByRole("radio", { name: "System" }));

    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    // system prefers light (mocked) → dark class removed
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("loads the stored preference on mount", async () => {
    localStorage.setItem(THEME_STORAGE_KEY, "light");
    render(<ThemeToggle />);

    expect(await screen.findByRole("radio", { name: "Hell" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
  });
});
