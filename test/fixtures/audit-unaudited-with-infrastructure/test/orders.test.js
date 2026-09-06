const assert = require("node:assert");
const { test } = require("node:test");
const { setOrderStatus, refund } = require("../src/orders");

test("status transitions are applied", () => {
  assert.equal(setOrderStatus("o1", "SHIPPED", { type: "USER", id: "u1" }, "c1").status, "SHIPPED");
});
test("refunds are applied", () => {
  assert.equal(refund("o2", 500, { type: "USER", id: "u1" }, "c2").refundedCents, 500);
});
test("a later transition overwrites the earlier status", () => {
  setOrderStatus("o3", "PAID", { type: "USER", id: "u1" }, "c3");
  assert.equal(setOrderStatus("o3", "SHIPPED", { type: "USER", id: "u1" }, "c4").status, "SHIPPED");
});
