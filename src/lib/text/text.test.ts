import { describe, expect, it } from "vitest";
import { splitSentences } from "./sentences";
import { stem, tokenize } from "./tokenize";

describe("tokenize", () => {
  it("lowercases, removes stopwords and punctuation", () => {
    expect(tokenize("What is the Refund policy?")).toEqual(["refund", "policy"]);
  });

  it("maps simple inflections to the same stem", () => {
    expect(stem("roasted")).toBe(stem("roasting"));
    expect(stem("roasts")).toBe("roast");
    expect(stem("shipping")).toBe("ship");
    expect(stem("policies")).toBe("policy");
    expect(stem("glass")).toBe("glass");
  });

  it("keeps numbers", () => {
    expect(tokenize("Shipping is 6.50 EUR")).toEqual(["ship", "6", "50", "eur"]);
  });
});

describe("splitSentences", () => {
  it("splits on sentence punctuation without breaking decimals", () => {
    expect(splitSentences("It costs 6.50 EUR. Delivery is fast! Really?")).toEqual([
      "It costs 6.50 EUR.",
      "Delivery is fast!",
      "Really?",
    ]);
  });

  it("treats Markdown headings and blank lines as boundaries", () => {
    expect(splitSentences("# Title\nSome text here\n\nNext paragraph")).toEqual(["# Title", "Some text here", "Next paragraph"]);
  });
});
