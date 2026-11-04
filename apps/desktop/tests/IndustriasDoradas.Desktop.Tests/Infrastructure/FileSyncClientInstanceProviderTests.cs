using System.IO;
using IndustriasDoradas.Desktop.Infrastructure.Sync;

namespace IndustriasDoradas.Desktop.Tests.Infrastructure;

[TestClass]
public sealed class FileSyncClientInstanceProviderTests
{
    [TestMethod]
    public void PersistsOneStableIdentityPerInstallationPath()
    {
        string directory = Path.Combine(Path.GetTempPath(), $"industrias-doradas-{Guid.NewGuid():N}");
        string path = Path.Combine(directory, "client-instance-id");
        try
        {
            Guid first = new FileSyncClientInstanceProvider(path).GetId();
            Guid second = new FileSyncClientInstanceProvider(path).GetId();

            Assert.AreNotEqual(Guid.Empty, first);
            Assert.AreEqual(first, second);
            Assert.AreEqual(first.ToString("D"), File.ReadAllText(path));
        }
        finally
        {
            if (Directory.Exists(directory))
                Directory.Delete(directory, recursive: true);
        }
    }

    [TestMethod]
    public void RejectsCorruptIdentityInsteadOfSilentlyChangingIt()
    {
        string directory = Path.Combine(Path.GetTempPath(), $"industrias-doradas-{Guid.NewGuid():N}");
        string path = Path.Combine(directory, "client-instance-id");
        Directory.CreateDirectory(directory);
        File.WriteAllText(path, "not-a-guid");
        try
        {
            var provider = new FileSyncClientInstanceProvider(path);
            Assert.ThrowsExactly<InvalidOperationException>(() => provider.GetId());
        }
        finally
        {
            Directory.Delete(directory, recursive: true);
        }
    }
}
