export function numberFromAmount(amount: string) {
  return Number(amount.replace("₹", "").replace(/,/g, ""));
}

export function formatMoney(value: number) {
  return `₹${value.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

export function isSuccessfulPaid(status: string) {
  return status === "Success";
}

export function isRefunded(status: string) {
  return status === "Refunded";
}

export function calculateCommission(amount: number, commissionRate = 0.25) {
  return amount * (commissionRate / 100);
}

export function calculateNetSettlement(amount: number, commissionRate = 0.25) {
  return amount - calculateCommission(amount, commissionRate);
}
