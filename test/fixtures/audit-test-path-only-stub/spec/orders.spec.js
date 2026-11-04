const { recordAuditEvent } = require("../test/helpers/audit");
const { setOrderStatus } = require("../src/orders");

recordAuditEvent({ entityType: "Order", action: "STATUS_CHANGED" });
setOrderStatus("o-1", "SHIPPED");
