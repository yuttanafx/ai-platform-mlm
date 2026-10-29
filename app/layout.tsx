import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_Thai } from "next/font/google";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";
import "./globals.css";

const font = IBM_Plex_Sans_Thai({
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_TAGLINE,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        {/* ตั้งโหมดที่ผู้ใช้เลือกไว้ก่อนวาดหน้า กันหน้าขาวแวบก่อนเปลี่ยนเป็นมืด */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("theme")==="dark"){document.documentElement.dataset.theme="dark";var m=document.querySelector('meta[name="theme-color"]');m&&m.setAttribute("content","#111e34")}}catch(e){}`,
          }}
        />
      </head>
      <body className={font.className}>{children}</body>
    </html>
  );
}
