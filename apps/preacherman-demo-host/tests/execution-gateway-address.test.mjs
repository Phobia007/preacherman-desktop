import assert from "node:assert/strict";
import test from "node:test";
import { connectionAddressAllowed, publicIpv4 } from "../server/executionConnections.mjs";

test("official DeepSeek HTTPS accepts TUN fake-IP answers without making them public addresses", () => {
  for (const address of ["198.18.0.15", "198.18.255.254", "198.19.0.1"]) {
    assert.equal(publicIpv4(address), false);
    assert.equal(connectionAddressAllowed(new URL("https://api.deepseek.com/models"), address), true);
    assert.equal(connectionAddressAllowed(new URL("https://api.deepseek.com/chat/completions"), address), true);
  }
});

test("fake-IP compatibility cannot be used by custom gateways, lookalikes, credentials or other ports", () => {
  for (const url of ["https://api.example.com", "http://api.deepseek.com", "https://api.deepseek.com:8443",
    "https://api.deepseek.com.evil.example", "https://other.api.deepseek.com", "https://api.deepseek.com.",
    "https://user@api.deepseek.com", "https://198.18.0.15"]) {
    assert.equal(connectionAddressAllowed(new URL(url), "198.18.0.15"), false, url);
  }
});

test("private, loopback, metadata and invalid IP answers stay blocked even for DeepSeek", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "172.16.0.1", "192.168.1.1", "169.254.169.254",
    "100.100.100.200", "198.18.0.999", "198.18.1", "::1", "0.0.0.0", "224.0.0.1"]) {
    assert.equal(connectionAddressAllowed(new URL("https://api.deepseek.com"), address), false, address);
  }
});

test("public DNS answers retain the existing direct gateway path", () => {
  for (const host of ["api.deepseek.com", "api.example.com"]) {
    assert.equal(connectionAddressAllowed(new URL(`https://${host}`), "8.8.8.8"), true);
  }
});
