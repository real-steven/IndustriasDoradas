using System.Text.RegularExpressions;

namespace IndustriasDoradas.Desktop.Application.Profile;

/// <summary>
/// Misma regla que la API (que es la que decide): Costa Rica de 8 dígitos (2, 4, 5, 6, 7 u 8),
/// con o sin +506, o internacional con + / 00 y de 8 a 15 dígitos. Se guarda en E.164.
/// </summary>
public static partial class PhoneNumber
{
    public const int MaxInputLength = 24;

    [GeneratedRegex("^[245678][0-9]{7}$")]
    private static partial Regex CostaRicaNational();

    [GeneratedRegex(@"^\+[1-9][0-9]{7,14}$")]
    private static partial Regex E164();

    [GeneratedRegex(@"^[+0-9\s().-]+$")]
    private static partial Regex Allowed();

    public static string? Normalize(string? input)
    {
        string raw = (input ?? string.Empty).Trim();
        if (raw.Length == 0 || raw.Length > MaxInputLength || !Allowed().IsMatch(raw)) return null;
        if (raw.IndexOf('+', StringComparison.Ordinal) > 0 || raw.Count(c => c == '+') > 1) return null;

        string digits = new(raw.Where(char.IsAsciiDigit).ToArray());
        bool international = raw.StartsWith('+') || digits.StartsWith("00", StringComparison.Ordinal);
        if (!raw.StartsWith('+') && digits.StartsWith("00", StringComparison.Ordinal)) digits = digits[2..];
        if (!international) return CostaRicaNational().IsMatch(digits) ? "+506" + digits : null;

        string candidate = "+" + digits;
        if (!E164().IsMatch(candidate)) return null;
        if (digits.StartsWith("506", StringComparison.Ordinal) && !CostaRicaNational().IsMatch(digits[3..])) return null;
        return candidate;
    }

    public static string Format(string? phone)
    {
        if (string.IsNullOrEmpty(phone)) return string.Empty;
        return phone.StartsWith("+506", StringComparison.Ordinal) && phone.Length == 12
            ? $"+506 {phone[4..8]} {phone[8..]}"
            : phone;
    }
}
