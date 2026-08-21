namespace IndustriasDoradas.Desktop.Configuration;

public sealed class SupabaseOptions
{
    public const string SectionName = "Supabase";
    public string Url { get; init; } = string.Empty;
    public string PublishableKey { get; init; } = string.Empty;
}
