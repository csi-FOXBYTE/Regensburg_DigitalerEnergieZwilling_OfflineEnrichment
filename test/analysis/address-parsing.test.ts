import assert from "node:assert/strict";
import test from "node:test";

import { parseThoroughfare } from "../../src/analysis/file-analyzer.js";

test("parseThoroughfare: single street and number", () => {
  assert.deepEqual(parseThoroughfare("Hauptstraße 5"), [{ street: "Hauptstraße", houseNumber: "5" }]);
});

test("parseThoroughfare: comma-separated house numbers", () => {
  assert.deepEqual(parseThoroughfare("Hauptstraße 5,5a,7"), [
    { street: "Hauptstraße", houseNumber: "5" },
    { street: "Hauptstraße", houseNumber: "5a" },
    { street: "Hauptstraße", houseNumber: "7" },
  ]);
});

test("parseThoroughfare: semicolon-separated segments", () => {
  assert.deepEqual(parseThoroughfare("Alte Straße 1;Keltenstraße 5"), [
    { street: "Alte Straße", houseNumber: "1" },
    { street: "Keltenstraße", houseNumber: "5" },
  ]);
});

test("parseThoroughfare: u.a. segment is skipped", () => {
  assert.deepEqual(parseThoroughfare("Karl-Stieler-Straße 50,52;Karl u.a."), [
    { street: "Karl-Stieler-Straße", houseNumber: "50" },
    { street: "Karl-Stieler-Straße", houseNumber: "52" },
  ]);
});

test("parseThoroughfare: segment with no number is skipped", () => {
  assert.deepEqual(parseThoroughfare("Sarmanna-Straße 16,18;Sarmanna-Straße"), [
    { street: "Sarmanna-Straße", houseNumber: "16" },
    { street: "Sarmanna-Straße", houseNumber: "18" },
  ]);
});
