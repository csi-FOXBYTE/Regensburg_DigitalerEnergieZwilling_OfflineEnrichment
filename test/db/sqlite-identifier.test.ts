import assert from "node:assert/strict";
import test from "node:test";

import { quoteSqliteIdentifier } from "../../src/db/sqlite-identifier.js";

test("SQLite identifier quoting supports spaces and embedded quotes", () => {
  assert.equal(quoteSqliteIdentifier("zone layer"), '"zone layer"');
  assert.equal(quoteSqliteIdentifier('a"b'), '"a""b"');
});
