import { maintenance } from "../server/razorpay";
import type { Env } from "../server/supabase";
export default {
  async scheduled(_event: unknown, env: Env) {
    await maintenance(env);
  },
};
