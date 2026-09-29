export const config = {
  name: import.meta.env.VITE_SHOP_NAME || "Bapi Mistanna Bhandar",
  site: import.meta.env.VITE_SITE_URL || "https://example.com",
  address:
    import.meta.env.VITE_STORE_ADDRESS ||
    "Bapi Mistanna Bhandar, Near Overbridge, Mancotta Road, Dibrugarh, Assam 786001",
  phone: import.meta.env.VITE_STORE_PHONE || "",
  freeShipping: 999,
  shipping: 79,
  localShipping: 49,
  localPincodes: ["781001", "781002", "781003", "781005", "781006"],
  boxFee: 99,
  wrapFee: 49,
};
export const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(n);
