import type { AppProps } from "next/app";

// Minimal _app to prevent Next.js from using default document structure
export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />;
}
