// An audit path carrying the Standard 3 R2 fields. Present in fixtures B and C, absent in A.
const events = [];

function recordAuditEvent({ entityType, entityId, action, actorType, actorId, before, after, reason, correlationId, requestId, source }) {
  if (!entityType || !entityId || !action || !actorType) {
    throw new Error("audit event missing a mandatory field");
  }
  events.push({ entityType, entityId, action, actorType, actorId, timestamp: new Date().toISOString(), before, after, reason, correlationId, requestId, source });
}

function auditLog() { return events.slice(); }

module.exports = { recordAuditEvent, auditLog };
