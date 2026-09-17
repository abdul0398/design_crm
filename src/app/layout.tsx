import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Jome Journey | Design desk",
  description: "Project websites, design revisions and client details.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
