import type { Metadata } from "next";

import { ShowcaseClient } from "./showcase-client";

export const metadata: Metadata = {
  title: "Showcase — Franz Adriene R. Aclon",
  description: "An interactive scroll showcase — full-stack development work.",
};

export default function ShowcasePage() {
  return <ShowcaseClient />;
}
