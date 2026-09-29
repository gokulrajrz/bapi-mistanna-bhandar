export type Variant = {
  id: string;
  label: string;
  price: number;
  stock: number;
};
export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  image: string;
  gallery: string[];
  ingredients: string[];
  allergens: string[];
  tags: string[];
  shelfLife: string;
  shelfLifeDays: number;
  requiresRefrigeration: boolean;
  pieceStock: number;
  imageSrcSet?: string;
  gallerySrcSets?: string[];
  variants: Variant[];
  featured: boolean;
  piecePrice: number;
  createdAt: string;
};
export type Filters = {
  search?: string;
  category?: string;
  sort?: string;
  occasion?: string;
  maxPrice?: number;
  available?: boolean;
  dietary?: string;
  collection?: string;
  page?: number;
  pageSize?: number;
  featured?: boolean;
};
export type Gift = {
  recipient: string;
  sender: string;
  message: string;
  date: string;
  wrap: boolean;
};
export type CartItem = {
  key: string;
  productId: string;
  variantId: string;
  name: string;
  image: string;
  label: string;
  price: number;
  quantity: number;
  gift?: Gift;
  box?: { size: number; pieces: Record<string, number> };
};
export type Checkout = {
  name: string;
  email: string;
  phone: string;
  address: string;
  pincode: string;
  method: "delivery" | "pickup";
  date: string;
  coupon: string;
  message: string;
};
export type Order = { id: string; total: number; status: string };

export type ProductPage = {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
};
export type QuoteLine = {
  name: string;
  label: string;
  image: string;
  quantity: number;
  unitPrice: number;
  productId: string;
  variantId: string;
  gift?: Gift;
  boxItems?: { name: string; quantity: number }[];
};
export type Quote = {
  id: string;
  expiresAt: string;
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  amount: number;
  currency: string;
  lines: QuoteLine[];
  earliestDate: string;
  deliveryLabel: string;
};
export type StoreContent = {
  storefront: typeof import("./content").defaultStorefront;
  operations: {
    checkoutEnabled: boolean;
    maintenanceMode: boolean;
    maintenanceMessage: string;
    reviewSubmissions: boolean;
    bulkEnquiries: boolean;
  };
  categories: string[];
  settings: {
    name: string;
    address: string;
    phone: string;
    hours: string;
    pickupInstructions: string;
    policies: { title: string; body: string }[];
    launchApproved: boolean;
  };
  commerce: {
    boxFee: number;
    wrapFee: number;
    freeShipping: number;
    pickupEnabled: boolean;
  };
  campaigns: {
    id: string;
    banner: string;
    starts_at: string;
    ends_at: string;
    collection: Collection;
  }[];
  collections: Collection[];
  posts: BlogPost[];
  store: { image?: string; hours?: string; pickupInstructions?: string } | null;
  paymentEnabled: boolean;
  turnstileSiteKey: string | null;
};
export type Collection = {
  id: string;
  title: string;
  description: string;
  hero: string;
  product_ids: string[];
};
export type BlogPost = {
  slug: string;
  title: string;
  body: string[];
  tag: string;
  image: string;
};
export type Address = {
  id: string;
  label: string;
  name: string;
  phone: string;
  address: string;
  pincode: string;
};
export type OrderDetails = {
  id: string;
  status: string;
  total: number;
  subtotal: number;
  shipping: number;
  discount: number;
  createdAt: string;
  expiresAt: string;
  contact: Checkout;
  tracking?: { carrier?: string; reference?: string; url?: string };
  items: { snapshot: QuoteLine; quantity: number; unit_price: number }[];
  events: {
    id: number;
    status: string;
    description: string;
    created_at: string;
  }[];
};
