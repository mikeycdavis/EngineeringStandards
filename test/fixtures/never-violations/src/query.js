export function findOrders(db, customer) {
  return db.query(`SELECT * FROM orders WHERE customer = ${customer}`);
}
