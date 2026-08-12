import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const EYEBROW = "rien.dev — Full-Stack Developer";
const HEADLINE = "Databases, integrations, tools that ship";

async function loadGoogleFont(family: string, text: string) {
  const css = await (
    await fetch(`https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(text)}`)
  ).text();
  const match = css.match(/src: url\(([^)]+)\)/);
  if (!match) throw new Error(`Could not resolve font source for ${family}`);
  const res = await fetch(match[1]);
  return res.arrayBuffer();
}

export default async function Image() {
  const mono = await loadGoogleFont("Geist+Mono", EYEBROW + HEADLINE);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#14120F",
          padding: "96px",
          fontFamily: "Geist Mono",
        }}
      >
        <div style={{ fontSize: 22, letterSpacing: 4, textTransform: "uppercase", color: "#9C9284" }}>
          {EYEBROW}
        </div>
        <div style={{ marginTop: 28, fontSize: 58, lineHeight: 1.25, color: "#F2EDE4", maxWidth: 950 }}>
          {HEADLINE}
        </div>
        <div style={{ marginTop: 32, width: 120, height: 4, background: "#E0A458" }} />
      </div>
    ),
    { ...size, fonts: [{ name: "Geist Mono", data: mono, style: "normal" }] }
  );
}
