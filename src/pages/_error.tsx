import { NextPage, NextPageContext } from "next";

interface ErrorProps {
  statusCode?: number;
}

const Error: NextPage<ErrorProps> = ({ statusCode }) => {
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
            color: statusCode === 404 ? "#667EEA" : "#dc2626",
            marginBottom: "0.5rem",
          }}
        >
          {statusCode || "Error"}
        </h1>
        <p style={{ color: "#6b7280", marginBottom: "1.5rem" }}>
          {statusCode === 404
            ? "The page you're looking for doesn't exist."
            : "An unexpected error occurred."}
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

Error.getInitialProps = ({ res, err }: NextPageContext) => {
  const statusCode = res ? res.statusCode : err ? err.statusCode : 404;
  return { statusCode };
};

export default Error;
