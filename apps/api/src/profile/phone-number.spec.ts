import { maskPhoneNumber, normalizePhoneNumber } from "./phone-number";

describe("normalizePhoneNumber", () => {
  it.each([
    ["8888-7777", "+50688887777"],
    ["2222 3333", "+50622223333"],
    ["+506 6123 4567", "+50661234567"],
    ["00506 7123-4567", "+50671234567"],
    ["+1 (415) 555-0100", "+14155550100"],
    ["0044 20 7946 0958", "+442079460958"],
  ])("normaliza %s", (input, expected) => {
    expect(normalizePhoneNumber(input)).toBe(expected);
  });

  it.each([
    "",
    "123",
    "1888-7777",
    "+506 1234 5678",
    "+506 8888",
    "abc88887777",
    "88+887777",
    "+0 123 456 789",
    "+1234567890123456",
  ])("rechaza %s", (input) => {
    expect(normalizePhoneNumber(input)).toBeNull();
  });

  it("enmascara para auditoría sin exponer el número completo", () => {
    expect(maskPhoneNumber("+50688887777")).toBe("+506••••7777");
    expect(maskPhoneNumber(null)).toBeNull();
  });
});
