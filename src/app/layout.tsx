import type { Metadata } from "next";
import { ConvexClientProvider } from "@/components/providers/ConvexClientProvider";
import "./globals.css";

/* No web fonts: like the Claude desktop app, the interface uses the system
   face (SF Pro on a Mac, Segoe UI on Windows). See --font-body. */

export const metadata: Metadata = {
  title: "The Ecultify",
  description: "Hierarchical RBAC task tracking application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <body className="antialiased bg-[#f6f6f5] text-[#171717]">
        <ConvexClientProvider>{children}</ConvexClientProvider>
      </body>
    </html>
  );
}
