import { storefrontExtra, defaultBoxSizes } from "./storefront-extra";
import { homeContent } from "./home-content";
import { z } from "zod";
const text = z.string().trim().max(5000);
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const image = z
  .string()
  .max(2048)
  .refine(
    (s) => s === "" || /^\/(?!\/)/.test(s) || /^https:\/\//.test(s),
    "Use a local path or HTTPS URL.",
  );
const stringList = z.array(z.string().trim().min(1).max(100)).max(30);
const amount = z
  .number()
  .nonnegative()
  .max(1000000)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001,
    "Use at most two decimal places.",
  );
export const productAdminSchema = z.object({
  id,
  revision: z.number().int().nonnegative().default(0),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  active: z.boolean(),
  sort_order: z.number().int().min(0).max(10000),
  data: z.object({
    name: z.string().trim().min(2).max(150),
    description: text,
    category: z.string().trim().min(1).max(80),
    image: image.refine((v) => v.length > 0),
    gallery: z.array(image).min(1).max(8),
    ingredients: stringList,
    allergens: stringList,
    tags: stringList,
    storageInstructions: text.default(""),
    freshnessDetails: text.default(""),
    crossContactWarning: text.default(""),
    shelfLife: z.string().min(1).max(100),
    shelfLifeDays: z.number().int().min(1).max(365),
    requiresRefrigeration: z.boolean(),
    featured: z.boolean(),
    createdAt: z.string().max(40),
  }),
  variants: z
    .array(
      z.object({
        id,
        revision: z.number().int().nonnegative().default(0),
        label: z.string().min(1).max(60),
        price: amount,
        stock: z.number().int().min(0).max(100000),
        sort_order: z.number().int().min(0).max(100),
      }),
    )
    .min(1)
    .max(12)
    .refine(
      (v) => new Set(v.map((x) => x.id)).size === v.length,
      "Variant IDs must be unique.",
    ),
  inventory: z.object({
    revision: z.number().int().nonnegative().default(0),
    piece_price: amount,
    pieces: z.number().int().min(0).max(100000),
  }),
});
function contrast(first: string, second: string) {
  const luminance = (hex: string) => {
    const values = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) =>
        v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
      );
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  const a = luminance(first),
    b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
export const settingsSchemas = {
  public: z.object({
    name: z.string().trim().min(2).max(100),
    address: text,
    phone: z.string().regex(/^$|^\+?[1-9]\d{9,14}$/),
    hours: text,
    pickupInstructions: text,
    policies: z
      .array(z.object({ title: z.string().min(1).max(100), body: text }))
      .max(20),
    launchApproved: z.boolean(),
  }),
  commerce: z.object({
    boxSizes: z
      .array(z.number().int().min(1).max(48))
      .min(1)
      .max(8)
      .refine((v) => new Set(v).size === v.length, "Box sizes must be unique.")
      .default(defaultBoxSizes),
    boxFee: amount,
    wrapFee: amount,
    freeShipping: amount,
    pickupEnabled: z.boolean(),
    reservationMinutes: z.number().int().min(10).max(60),
    pickupMinDays: z.number().int().min(0).max(30),
    cancellationEnabled: z.boolean(),
  }),
  storefront: z
    .object({
      home: z
        .object({
          footnote: text,
          promises: z.array(text).length(4),
          bestsellersEyebrow: text,
          bestsellersTitle: text,
          introductionEyebrow: text,
          introductionTitle: text,
          introductionBody: text,
          introductionImage: image,
          introductionCaption: text,
          occasionsEyebrow: text,
          occasionsTitle: text,
          occasions: z
            .array(
              z.object({
                title: text,
                sub: text,
                to: z.string().regex(/^\/(?!\/)/),
                image,
              }),
            )
            .max(8),
          boxEyebrow: text,
          boxTitle: text,
          boxDescription: text,
          journalEyebrow: text,
          journalTitle: text,
          closing: text,
        })
        .default(homeContent),
      experience: z
        .object({
          catalogueEyebrow: text,
          catalogueTitle: text,
          catalogueDescription: text,
          prices: z.array(amount).max(12),
          dietaryOptions: z
            .array(z.object({ label: text, value: z.string().min(1).max(40) }))
            .max(20),
          occasionOptions: z
            .array(z.object({ label: text, value: z.string().min(1).max(40) }))
            .max(20),
          badges: z
            .array(
              z.object({
                category: text,
                productId: z.string().max(80),
                label: text,
              }),
            )
            .max(30),
          footerColumns: z
            .array(
              z.object({
                title: text,
                links: z
                  .array(
                    z.object({
                      label: text,
                      to: z.string().regex(/^\/(?!\/)/),
                    }),
                  )
                  .max(12),
              }),
            )
            .max(5),
          footerSignature: text,
          cartRecommendations: z.boolean(),
          cartRecommendationsTitle: text,
          storyMotion: z.boolean(),
        })
        .default(storefrontExtra.experience),
      logo: image.default(""),
      favicon: image.default("/favicon.svg"),
      pages: z
        .object({
          storyEyebrow: text,
          storySubtitle: text,
          storySectionTitle: text,
          makingSteps: z.array(text).max(12),
          giftsEyebrow: text,
          giftsFeatureEyebrow: text,
          giftsFeatureTitle: text,
          giftsFeatureDescription: text,
          giftingCards: z
            .array(
              z.object({
                title: text,
                description: text,
                to: z.string().regex(/^\/(?!\/)/),
                image,
              }),
            )
            .max(12),
          journalEyebrow: text,
          journalTitle: text,
          journalDescription: text,
          builderEyebrow: text,
          builderTitle: text,
          builderDescription: text,
        })
        .default(storefrontExtra.pages),
      announcement: text,
      tagline: text,
      heroEyebrow: text,
      heroTitle: text,
      heroAccent: text,
      heroDescription: text,
      heroImage: image,
      heroCta: text,
      heroLink: z.string().regex(/^\/(?!\/)/),
      footerTitle: text,
      footerDescription: text,
      primaryColor: z.string().regex(/^#[a-f\d]{6}$/i),
      backgroundColor: z.string().regex(/^#[a-f\d]{6}$/i),
      seoDescription: text,
      socialImage: image,
      navigation: z
        .array(
          z.object({
            label: z.string().min(1).max(40),
            to: z.string().regex(/^\/(?!\/)/),
          }),
        )
        .min(1)
        .max(8),
      sections: z.object({
        bestsellers: z.boolean(),
        introduction: z.boolean(),
        occasions: z.boolean(),
        boxBuilder: z.boolean(),
        journal: z.boolean(),
      }),
      storyTitle: text,
      storyParagraphs: z.array(text).max(20),
      giftsTitle: text,
      giftsDescription: text,
    })
    .refine(
      (v) =>
        contrast(v.primaryColor, v.backgroundColor) >= 4.5 &&
        contrast(v.primaryColor, "#fffaf3") >= 4.5 &&
        contrast("#64584e", v.backgroundColor) >= 4.5,
      "Choose theme colours with sufficient text contrast (at least 4.5:1).",
    ),
  operations: z.object({
    checkoutEnabled: z.boolean(),
    maintenanceMode: z.boolean(),
    maintenanceMessage: text,
    reviewSubmissions: z.boolean(),
    bulkEnquiries: z.boolean(),
  }),
};
export const resourceSchemas = {
  customers: z.object({
    user_id: z.uuid(),
    name: z.string().trim().min(2).max(100),
    phone: z.string().regex(/^$|^[6-9]\d{9}$/),
    staff_notes: z.string().max(2000),
    revision: z.number().int().positive(),
  }),
  products: productAdminSchema,
  delivery_zones: z
    .object({
      id: z.number().int().positive().optional(),
      name: z.string().min(1).max(100),
      pincode: z.string().regex(/^\d{6}$/),
      charge: amount,
      minimum_order: amount,
      active: z.boolean(),
      min_days: z.number().int().min(0).max(30),
      max_days: z.number().int().min(0).max(30),
      refrigerated: z.boolean(),
      same_day_cutoff: z.number().int().min(0).max(23),
    })
    .refine(
      (v) => v.max_days >= v.min_days,
      "Maximum days must be at least minimum days.",
    ),
  coupons: z.object({
    code: z.string().regex(/^[A-Z0-9_-]{2,40}$/),
    percent: z.number().int().min(1).max(100),
    max_discount: amount,
    minimum_order: amount,
    expires_at: z.iso.datetime().nullable(),
    active: z.boolean(),
  }),
  collections: z.object({
    id,
    title: z.string().min(1).max(150),
    description: text,
    product_ids: z.array(id).max(500),
    hero: image,
    active: z.boolean(),
  }),
  festival_campaigns: z
    .object({
      id,
      collection_id: id,
      banner: text,
      starts_at: z.iso.datetime(),
      ends_at: z.iso.datetime(),
      active: z.boolean(),
    })
    .refine((v) => v.ends_at > v.starts_at, "End date must follow start date."),
  blog_posts: z.object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    title: z.string().min(1).max(180),
    body: z.string().max(50000),
    published: z.boolean(),
    data: z.object({ tag: z.string().max(100), image }),
  }),
  stores: z.object({
    revision: z.number().int().nonnegative().default(0),
    id: z.literal("main"),
    name: z.string().min(1).max(100),
    address: text,
    phone: z.string().regex(/^$|^\+?[1-9]\d{9,14}$/),
    hours: z.record(z.string(), z.string()),
    pickup_enabled: z.boolean(),
    data: z.object({ image, hours: text, pickupInstructions: text }),
  }),
  reviews: z.object({ id: z.uuid(), published: z.boolean() }),
  admin_users: z.object({
    user_id: z.uuid(),
    role: z.enum(["owner", "manager"]),
  }),
};
export type AdminResource = keyof typeof resourceSchemas;
