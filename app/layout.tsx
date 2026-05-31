import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "状态翻译器",
  description: "把说不清的状态翻译成一种可以轻轻开始的活法。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#fbfaf7] text-[#23201d]">
        {children}
      </body>
    </html>
  );
}
