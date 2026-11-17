import { homeContent } from "./home-content";
import { storefrontExtra } from "./storefront-extra";
export const defaultStorefront = {
  ...storefrontExtra,
  home: homeContent,
  announcement: "A little sweetness. A little closer to home.",
  tagline: "ASSAM · HANDCRAFTED WITH LOVE",
  heroEyebrow: "FROM THE HEART OF ASSAM",
  heroTitle: "A little sweet.",
  heroAccent: "A little Assam.",
  heroDescription:
    "Handcrafted mithai. Familiar flavours.\nFor moments that deserve a little more love.",
  heroImage: "/images/hero.webp",
  heroCta: "Discover our sweets",
  heroLink: "/shop",
  footerTitle: "Good things.\nMade to be shared.",
  footerDescription: "A little piece of Assam, from our kitchen to yours.",
  primaryColor: "#692c36",
  backgroundColor: "#fbf8f1",
  seoDescription:
    "Discover Assamese specialties, handcrafted mithai and thoughtful gifting in Dibrugarh.",
  socialImage: "/images/hero.webp",
  navigation: [
    { label: "Shop", to: "/shop" },
    { label: "Gifting", to: "/gifts" },
    { label: "Build a box", to: "/build-a-box" },
    { label: "Our story", to: "/story" },
    { label: "Journal", to: "/journal" },
  ],
  sections: {
    bestsellers: true,
    introduction: true,
    occasions: true,
    boxBuilder: true,
    journal: true,
  },
  storyTitle: "Made the old way. Shared in your own way.",
  storyParagraphs: [
    "At Bapi Mistanna Bhandar, there is always a reason to share something sweet. A festival. A familiar face. A quiet cup of afternoon tea.",
    "Our home is Dibrugarh, Assam. The flavours of pitha and laru sit beside much-loved mithai classics, bringing regional favourites and everyday celebrations to the same table.",
  ],
  giftsTitle: "Send something sweet.",
  giftsDescription:
    "A little sweetness from Assam, for the people who make life sweeter.",
};
