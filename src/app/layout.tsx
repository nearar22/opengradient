import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AMM Dynamic Fee Optimizer | OpenGradient",
  description: "Real-time on-chain AI inference for ETH/USDT liquidity pool fee optimization using OpenGradient. Predict volatility and dynamically adjust AMM fees.",
  keywords: ["AMM", "DeFi", "dynamic fee", "OpenGradient", "on-chain AI", "ETH/USDT", "liquidity pool"],
  openGraph: {
    title: "AMM Dynamic Fee Optimizer",
    description: "On-chain AI inference for ETH/USDT liquidity pool fee optimization",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="gradient-bg" />
        {children}
      </body>
    </html>
  );
}
