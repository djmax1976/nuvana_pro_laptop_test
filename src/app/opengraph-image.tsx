import { ImageResponse } from "next/og";

// Image metadata
export const alt = "Nuvana Pro - Enterprise Store Management Platform";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

// Image generation
export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        fontSize: 64,
        background: "linear-gradient(135deg, #0f172a 0%, #1e40af 100%)",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        color: "white",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      {/* Logo mark */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 40,
        }}
      >
        <svg
          width="120"
          height="120"
          viewBox="0 0 32 32"
          style={{ marginRight: 20 }}
        >
          <rect width="32" height="32" rx="6" fill="rgba(255,255,255,0.15)" />
          <path
            d="M8 8 L8 24 L12 24 L12 16 L20 24 L24 24 L24 8 L20 8 L20 16 L12 8 Z"
            fill="#fff"
          />
        </svg>
        <span style={{ fontSize: 80, fontWeight: 700 }}>Nuvana Pro</span>
      </div>

      {/* Tagline */}
      <div
        style={{
          fontSize: 32,
          color: "#93c5fd",
          marginTop: 10,
        }}
      >
        Enterprise Store Management Platform
      </div>

      {/* Feature highlights */}
      <div
        style={{
          display: "flex",
          marginTop: 50,
          gap: 40,
          fontSize: 24,
          color: "#e2e8f0",
        }}
      >
        <span>Multi-Store Operations</span>
        <span>•</span>
        <span>Real-Time Analytics</span>
        <span>•</span>
        <span>Role-Based Access</span>
      </div>
    </div>,
    {
      ...size,
    },
  );
}
