// /app/layout.js

export const metadata = {
  title: 'LVE360',
  description: 'Personalized supplement platform powered by AI',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
