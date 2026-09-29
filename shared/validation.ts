import { z } from "zod";
export const indiaToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const futureDate = z.iso
  .date()
  .refine((v) => v >= indiaToday(), "Choose today or a future date.");
export const giftSchema = z.object({
  recipient: z.string().trim().max(100),
  sender: z.string().trim().max(100),
  message: z.string().trim().max(500),
  date: z.union([z.literal(""), futureDate]),
  wrap: z.boolean(),
});
export const contactSchema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name.").max(100),
    email: z.email("Enter a valid email address.").max(254),
    phone: z
      .string()
      .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number."),
    address: z.string().trim().max(500),
    pincode: z.string().max(6),
    method: z.enum(["delivery", "pickup"]),
    date: futureDate,
    coupon: z
      .string()
      .trim()
      .max(40)
      .transform((v) => v.toUpperCase()),
    message: z.string().trim().max(500),
  })
  .superRefine((v, c) => {
    if (v.method === "delivery") {
      if (v.address.length < 10)
        c.addIssue({
          code: "custom",
          path: ["address"],
          message: "Enter your complete delivery address.",
        });
      if (!/^\d{6}$/.test(v.pincode))
        c.addIssue({
          code: "custom",
          path: ["pincode"],
          message: "Enter a valid 6-digit pincode.",
        });
    }
  });
export const orderLineSchema = z
  .object({
    productId: z.string().min(1).max(80),
    variantId: z.string().min(1).max(80),
    quantity: z.number().int().min(1).max(30),
    gift: giftSchema.optional(),
    box: z
      .object({
        size: z.union([
          z.literal(6),
          z.literal(12),
          z.literal(18),
          z.literal(24),
        ]),
        pieces: z.record(
          z.string().min(1).max(80),
          z.number().int().min(1).max(24),
        ),
      })
      .optional(),
  })
  .superRefine((v, c) => {
    if (
      v.box &&
      (v.productId !== "custom-box" ||
        Object.values(v.box.pieces).reduce((a, b) => a + b, 0) !== v.box.size)
    )
      c.addIssue({
        code: "custom",
        message: "Please fill every space in your gift box.",
      });
    if (v.productId === "custom-box" && !v.box)
      c.addIssue({ code: "custom", message: "Your gift box is incomplete." });
  });
export const quoteRequestSchema = z.object({
  items: z.array(orderLineSchema).min(1, "Your bag is empty.").max(50),
  contact: contactSchema,
});
export const orderRequestSchema = quoteRequestSchema.extend({
  requestId: z.uuid(),
});
export const checkoutRequestSchema = z.object({
  requestId: z.uuid(),
  quoteId: z.uuid(),
  turnstileToken: z.string().max(2048),
});
export const addressSchema = z.object({
  id: z.uuid().optional(),
  label: z.string().trim().min(1).max(50),
  name: z.string().trim().min(2).max(100),
  phone: z.string().regex(/^[6-9]\d{9}$/),
  address: z.string().trim().min(10).max(500),
  pincode: z.string().regex(/^\d{6}$/),
});
