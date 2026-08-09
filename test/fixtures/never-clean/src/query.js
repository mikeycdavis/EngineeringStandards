const SORTABLE = ["created_at", "total"];
export function findOrders(db, customer, sort) {
  const col = SORTABLE.includes(sort) ? sort : "created_at";
  const rows = db.query("SELECT * FROM orders WHERE customer = $1", [customer]);
  return { rows, col };
}
