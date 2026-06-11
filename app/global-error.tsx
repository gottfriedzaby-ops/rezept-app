"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

// Last-resort error boundary for App Router rendering errors. Must render its
// own <html>/<body> because it replaces the root layout. Plain German text —
// next-intl is not available at this level.
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="de">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#FAFAF7",
          color: "#1C1C1A",
        }}
      >
        <div style={{ textAlign: "center", padding: "1.5rem" }}>
          <h1 style={{ fontSize: "1.25rem", marginBottom: "0.75rem" }}>
            Etwas ist schiefgelaufen
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#6B6B66", marginBottom: "1.25rem" }}>
            Der Fehler wurde gemeldet. Bitte versuche es erneut.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#2D5F3F",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              padding: "0.6rem 1.25rem",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            Erneut versuchen
          </button>
        </div>
      </body>
    </html>
  );
}
