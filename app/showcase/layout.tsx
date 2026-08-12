import { Shippori_Mincho } from "next/font/google";

const shippori = Shippori_Mincho({
  variable: "--font-shippori",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export default function ShowcaseLayout({ children }: { children: React.ReactNode }) {
  return <div className={shippori.variable}>{children}</div>;
}
