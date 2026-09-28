import type { MetadataRoute } from "next";
import loadingIcon from "./icon3-gradient.png";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BoostMaster",
    short_name: "BoostMaster",
    description: "BoostMaster helps you track goals, tasks, and habits.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f6f7f4",
    theme_color: "#4f936f",
    icons: [
      {
        src: loadingIcon.src,
        sizes: "1254x1254",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
