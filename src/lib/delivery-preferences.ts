export type DeliveryPreferences = {
  method: "delivery" | "pickup";
  pincode: string;
  date: string;
  coupon: string;
};
export const emptyDelivery: DeliveryPreferences = {
  method: "delivery",
  pincode: "",
  date: "",
  coupon: "",
};
const key = "bapi-delivery-preferences-v1";
export function readDeliveryPreferences(): DeliveryPreferences {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null");
    if (!value) return { ...emptyDelivery };
    return {
      method: value.method === "pickup" ? "pickup" : "delivery",
      pincode:
        typeof value.pincode === "string" && /^\d{0,6}$/.test(value.pincode)
          ? value.pincode
          : "",
      date:
        typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date)
          ? value.date
          : "",
      coupon: typeof value.coupon === "string" ? value.coupon.slice(0, 40) : "",
    };
  } catch {
    return { ...emptyDelivery };
  }
}
export function saveDeliveryPreferences(value: DeliveryPreferences) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Keep the in-memory draft when storage is unavailable. */
  }
}
