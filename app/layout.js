import "./globals.css";

export const metadata = {
  title: "Sun Moon Earth TCG",
  description: "3陣営カードゲーム",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
