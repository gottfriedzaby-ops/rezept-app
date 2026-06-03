import ShoppingMode from "@/components/ShoppingMode";

// Full-screen, in-store shopping experience. All behavior lives in the client
// component; this wrapper reads nothing server-side and inherits the locale
// layout (next-intl provider, fonts).
export default function ShopPage() {
  return <ShoppingMode />;
}
