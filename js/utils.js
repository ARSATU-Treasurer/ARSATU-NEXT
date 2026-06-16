// js/utils.js

// Format เงินบาทไทย (THB)
function formatThaiCurrency(amount) {
  return new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

// Format วันที่แบบไทย (เช่น 6 มิ.ย. 2569)
function formatThaiDate(dateString) {
  const d = new Date(dateString);
  return new Intl.DateTimeFormat("th-TH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}