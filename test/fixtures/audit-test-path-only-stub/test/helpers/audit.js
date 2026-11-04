// A test double for an audit recorder. It lives under a test path, so it is a stub, not a mechanism.
class AuditEvent {
  constructor(fields) {
    Object.assign(this, fields);
  }
}

const recorded = [];

function recordAuditEvent(fields) {
  recorded.push(new AuditEvent(fields));
}

module.exports = { AuditEvent, recordAuditEvent, recorded };
