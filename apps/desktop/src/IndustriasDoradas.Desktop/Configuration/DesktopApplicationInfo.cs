using System.Reflection;

namespace IndustriasDoradas.Desktop.Configuration;

public static class DesktopApplicationInfo
{
    public const string SprintLabel = "Sprint 3";

    public static string Version { get; } = ReadVersion();

    private static string ReadVersion()
    {
        Version? version = typeof(DesktopApplicationInfo).Assembly.GetName().Version;
        return version is null ? "0.3.0" : $"{version.Major}.{version.Minor}.{version.Build}";
    }
}
