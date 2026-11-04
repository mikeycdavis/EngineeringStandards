// Business state that changes with no audit path in application code. The only audit-shaped code in
// this fixture lives under test paths, which never count as audit presence (ST-26, #119).
const orders = new Map();

function setOrderStatus(orderId, status) {
  const after = { ...(orders.get(orderId) ?? { id: orderId }), status };
  orders.set(orderId, after);
  return after;
}

module.exports = { setOrderStatus, orders };
