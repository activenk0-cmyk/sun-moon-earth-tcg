import "./globals.css";
import "./compact.css";

export const metadata = {
  title: "SUN / MOON / EARTH",
  description: "3陣営カードゲーム",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07061a",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@700;900&family=Noto+Serif+JP:wght@400;700;900&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
