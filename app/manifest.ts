import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BOOST MASTERY",
    short_name: "BOOST",
    description: "BOOST MASTERY helps you track goals, todos, and routines.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7f4",
    theme_color: "#047857",
    icons: [
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  };
}
