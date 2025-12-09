import { ImageResponse } from "next/og";

// Apple Touch Icon - 180x180 for iOS home screen
export const size = {
  width: 180,
  height: 180,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        fontSize: 24,
        background: "linear-gradient(135deg, #0f172a 0%, #1e40af 100%)",
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 36, // iOS rounds corners anyway, but helps with maskable
      }}
    >
      <svg width="120" height="120" viewBox="0 0 32 32">
        <path
          d="M8 8 L8 24 L12 24 L12 16 L20 24 L24 24 L24 8 L20 8 L20 16 L12 8 Z"
          fill="#fff"
        />
      </svg>
    </div>,
    {
      ...size,
    },
  );
}
