// Business state that moves money and grants permissions. Nothing records who changed it, when,
// or from what to what. There is no audit path anywhere in this fixture.
const orders = new Map();

function setOrderStatus(orderId, status) {
  const after = { ...(orders.get(orderId) ?? { id: orderId }), status };
  orders.set(orderId, after);
  return after;
}

function refund(orderId, amountCents) {
  const after = { ...(orders.get(orderId) ?? { id: orderId }), refundedCents: amountCents };
  orders.set(orderId, after);
  return after;
}

function grantAdmin(userId) {
  orders.set(`perm:${userId}`, { admin: true });
  return true;
}

module.exports = { setOrderStatus, refund, grantAdmin, orders };
