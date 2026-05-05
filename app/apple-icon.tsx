import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#2D5F3F",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            color: "#FAFAF7",
            fontSize: 126,
            fontFamily: "Georgia, serif",
            fontWeight: 700,
            lineHeight: 1,
            paddingBottom: 8,
          }}
        >
          R
        </span>
      </div>
    ),
    { ...size }
  );
}
