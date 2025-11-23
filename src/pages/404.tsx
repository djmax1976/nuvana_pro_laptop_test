import { NextPage } from "next";

const Custom404: NextPage = () => {
  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        fontFamily: "system-ui, sans-serif",
        backgroundColor: "#fafafa",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "28rem" }}>
        <h1
          style={{
            fontSize: "3.75rem",
            fontWeight: "bold",
            color: "#667EEA",
            marginBottom: "0.5rem",
          }}
        >
          404
        </h1>
        <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
          The page you&apos;re looking for doesn&apos;t exist.
        </p>
        <a
          href="/"
          style={{
            display: "inline-block",
            padding: "0.75rem 1.5rem",
            backgroundColor: "#667EEA",
            color: "white",
            textDecoration: "none",
            borderRadius: "0.375rem",
            fontSize: "1rem",
          }}
        >
          Go Home
        </a>
      </div>
    </div>
  );
};

export default Custom404;
