// app/layout.js
export const metadata = {
  title: "LVE360",
  description: "Live Better | Longevity · Vitality · Energy",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
