import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider, getSystemConfig } from "@/components/theme-provider";
import { PermissionsProvider } from "@/lib/auth/use-permissions";

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
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans transition-colors duration-150">
        <ThemeProvider>
          <PermissionsProvider>{children}</PermissionsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
