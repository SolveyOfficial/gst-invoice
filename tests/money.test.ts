import { describe, expect, it } from "vitest";

import {
  amountInWords,
  formatInr,
  formatNumber,
  formatPaise,
  formatRupees,
  groupIndian,
  numberToWords,
  parseAmount,
  toPaise,
} from "../src/lib/money";

describe("Indian digit grouping", () => {
  it("groups whole numbers", () => {
    expect(groupIndian("0")).toBe("0");
    expect(groupIndian("999")).toBe("999");
    expect(groupIndian("1000")).toBe("1,000");
    expect(groupIndian("100000")).toBe("1,00,000");
    expect(groupIndian("12345678")).toBe("1,23,45,678");
    expect(groupIndian("1234567890")).toBe("1,23,45,67,890");
  });

  it("formats paise as rupees", () => {
    expect(formatPaise(0)).toBe("0.00");
    expect(formatPaise(5)).toBe("0.05");
    expect(formatPaise(12345650)).toBe("1,23,456.50");
    expect(formatPaise(1234567890)).toBe("1,23,45,678.90");
    expect(formatPaise(-150000)).toBe("-1,500.00");
  });

  it("formats rupees and the rupee sign", () => {
    expect(formatRupees(123456.5)).toBe("1,23,456.50");
    expect(formatInr(10000000)).toBe("₹1,00,000.00");
    expect(formatInr(-40)).toBe("-₹0.40");
  });

  it("formats quantities", () => {
    expect(formatNumber(2)).toBe("2");
    expect(formatNumber(2.5)).toBe("2.5");
    expect(formatNumber(1.2345)).toBe("1.235");
    expect(formatNumber(150000)).toBe("1,50,000");
  });

  it("parses typed amounts", () => {
    expect(parseAmount("1,23,456.50")).toBe(123456.5);
    expect(parseAmount("₹ 500")).toBe(500);
    expect(parseAmount("")).toBe(0);
    expect(parseAmount("12a")).toBeNaN();
  });
});

describe("rounding to paise", () => {
  it("rounds halves up", () => {
    expect(toPaise(1.005)).toBe(101);
    expect(toPaise(0.125)).toBe(13);
    expect(toPaise(2.675)).toBe(268);
    expect(toPaise(-1.005)).toBe(-101);
    expect(toPaise(0.1 + 0.2)).toBe(30);
  });
});

describe("number to words", () => {
  it("writes small numbers", () => {
    expect(numberToWords(0)).toBe("Zero");
    expect(numberToWords(5)).toBe("Five");
    expect(numberToWords(15)).toBe("Fifteen");
    expect(numberToWords(20)).toBe("Twenty");
    expect(numberToWords(45)).toBe("Forty-Five");
    expect(numberToWords(100)).toBe("One Hundred");
    expect(numberToWords(101)).toBe("One Hundred One");
    expect(numberToWords(999)).toBe("Nine Hundred Ninety-Nine");
  });

  it("uses thousand, lakh and crore", () => {
    expect(numberToWords(1000)).toBe("One Thousand");
    expect(numberToWords(100000)).toBe("One Lakh");
    expect(numberToWords(1005000)).toBe("Ten Lakh Five Thousand");
    expect(numberToWords(10000000)).toBe("One Crore");
    expect(numberToWords(12345678)).toBe(
      "One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight",
    );
  });

  it("writes hundreds of crores", () => {
    expect(numberToWords(1_234_567_890)).toBe(
      "One Hundred Twenty-Three Crore Forty-Five Lakh Sixty-Seven Thousand Eight Hundred Ninety",
    );
    expect(numberToWords(99_00_00_000)).toBe("Ninety-Nine Crore");
    expect(numberToWords(10_00_00_00_000)).toBe("One Thousand Crore");
  });

  it("writes invoice amounts", () => {
    expect(amountInWords(0)).toBe("Rupees Zero Only");
    expect(amountInWords(500)).toBe("Rupees Five Only");
    expect(amountInWords(1500)).toBe("Rupees Fifteen Only");
    expect(amountInWords(10000)).toBe("Rupees One Hundred Only");
    expect(amountInWords(100000)).toBe("Rupees One Thousand Only");
    expect(amountInWords(10000000)).toBe("Rupees One Lakh Only");
    expect(amountInWords(12345650)).toBe(
      "Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Fifty Paise Only",
    );
    expect(amountInWords(1234567890)).toBe(
      "Rupees One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight and Ninety Paise Only",
    );
    expect(amountInWords(50)).toBe("Fifty Paise Only");
    expect(amountInWords(-10000)).toBe("Minus Rupees One Hundred Only");
  });
});
