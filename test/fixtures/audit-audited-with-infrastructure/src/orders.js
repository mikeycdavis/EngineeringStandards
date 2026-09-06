const { recordAuditEvent } = require("./audit");

const orders = new Map();

function setOrderStatus(orderId, status, actor, correlationId) {
  const before = orders.get(orderId) ?? null;
  const after = { ...(before ?? { id: orderId }), status };
  orders.set(orderId, after);
  recordAuditEvent({
    entityType: "Order", entityId: orderId, action: "STATUS_CHANGED",
    actorType: actor.type, actorId: actor.id, before, after,
    reason: "status transition", correlationId, requestId: correlationId, source: "orders-service",
  });
  return after;
}

function refund(orderId, amountCents, actor, correlationId) {
  const before = orders.get(orderId) ?? null;
  const after = { ...(before ?? { id: orderId }), refundedCents: amountCents };
  orders.set(orderId, after);
  recordAuditEvent({
    entityType: "Order", entityId: orderId, action: "REFUNDED",
    actorType: actor.type, actorId: actor.id, before, after,
    reason: "customer refund", correlationId, requestId: correlationId, source: "orders-service",
  });
  return after;
}

module.exports = { setOrderStatus, refund, orders };
