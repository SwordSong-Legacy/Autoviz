import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { SurveyButton } from "@/components/layout";

export const metadata: Metadata = {
  title: "autoviz",
  description: "AutoViz - revolution to visualisation",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          {children}
          <SurveyButton />
        </Providers>
      </body>
    </html>
  );
}
