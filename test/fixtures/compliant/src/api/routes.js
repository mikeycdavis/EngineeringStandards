import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_KEY);
export function register(app) {
  app.get("/health", (req, res) => res.json({ ok: true }));
}
