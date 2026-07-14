import MerchantShell from "@/components/MerchantShell";

export default function MerchantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MerchantShell>{children}</MerchantShell>;
}
