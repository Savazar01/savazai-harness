import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider, getSystemConfig } from "@/components/theme-provider";

export async function generateMetadata(): Promise<Metadata> {
  const config = await getSystemConfig();
  return {
    title: config.appTitle,
    description: "Enterprise Orchestration Console for SavazAI",
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-950 text-slate-100 font-sans">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
