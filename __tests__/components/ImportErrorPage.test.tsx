import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

jest.mock("next/link", () => {
  return function Link({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    );
  };
});

import ImportErrorPage from "@/components/ImportErrorPage";

describe("ImportErrorPage", () => {
  it("renders a German FETCH_BLOCKED heading and body", () => {
    render(
      <ImportErrorPage sourceType="url" errorCode="FETCH_BLOCKED" onRetry={() => {}} />
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /Konnten die Seite nicht lesen/i
    );
    expect(
      screen.getByText(/Cloudflare oder einen Login/i)
    ).toBeInTheDocument();
  });

  it("renders a German EMPTY_PARSE heading and body", () => {
    render(
      <ImportErrorPage sourceType="url" errorCode="EMPTY_PARSE" onRetry={() => {}} />
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(
      /Konnten kein Rezept extrahieren/i
    );
    expect(
      screen.getByText(/weder Zutaten noch Schritte/i)
    ).toBeInTheDocument();
  });

  it("provides a 'Manuell anlegen' link pointing to /recipes/new", () => {
    render(
      <ImportErrorPage sourceType="url" errorCode="EMPTY_PARSE" onRetry={() => {}} />
    );
    const link = screen.getByRole("link", { name: /Manuell anlegen/i });
    expect(link).toHaveAttribute("href", "/recipes/new");
  });

  it("calls onRetry when the retry button is clicked", () => {
    const onRetry = jest.fn();
    render(
      <ImportErrorPage sourceType="url" errorCode="EMPTY_PARSE" onRetry={onRetry} />
    );
    fireEvent.click(screen.getByRole("button", { name: /Andere URL versuchen/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["url", /Andere URL versuchen/i],
    ["youtube", /Anderes Video versuchen/i],
    ["photo", /Andere Bilder versuchen/i],
    ["instagram", /Anderen Instagram-Link versuchen/i],
    ["pdf", /Anderes PDF versuchen/i],
  ] as const)(
    "shows a source-type-specific retry label for %s",
    (sourceType, expectedLabel) => {
      render(
        <ImportErrorPage
          sourceType={sourceType}
          errorCode="EMPTY_PARSE"
          onRetry={() => {}}
        />
      );
      expect(
        screen.getByRole("button", { name: expectedLabel })
      ).toBeInTheDocument();
    }
  );
});
