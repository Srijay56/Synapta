import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CognitionOS — Cognitive Continuity System",
  description:
    "A persistent AI co-worker that remembers how you think and work across time. Maintain context, memory, and momentum across work sessions.",
  keywords: ["cognitive", "AI", "productivity", "memory", "work patterns"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {/* Animated mesh background */}
        <div className="bg-mesh" />

        {/* Main content */}
        <div className="relative z-10">{children}</div>
      </body>
    </html>
  );
}
