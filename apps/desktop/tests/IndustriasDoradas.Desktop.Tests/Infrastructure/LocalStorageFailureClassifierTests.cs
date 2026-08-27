using IndustriasDoradas.Desktop.Infrastructure.LocalStorage;
using Microsoft.Data.Sqlite;

namespace IndustriasDoradas.Desktop.Tests.Infrastructure;

[TestClass]
public sealed class LocalStorageFailureClassifierTests
{
    [TestMethod]
    [DataRow(5, LocalStorageFailureKind.Locked)]
    [DataRow(6, LocalStorageFailureKind.Locked)]
    [DataRow(13, LocalStorageFailureKind.DiskFull)]
    [DataRow(11, LocalStorageFailureKind.Corrupt)]
    [DataRow(26, LocalStorageFailureKind.Corrupt)]
    [DataRow(8, LocalStorageFailureKind.Unavailable)]
    [DataRow(10, LocalStorageFailureKind.Unavailable)]
    [DataRow(14, LocalStorageFailureKind.Unavailable)]
    public void SqliteErrorsMapToSafeRecoveryInstructions(int sqliteCode, LocalStorageFailureKind expected)
    {
        LocalStorageFailure result = LocalStorageFailureClassifier.Classify(
            new SqliteException("simulated", sqliteCode));

        Assert.AreEqual(expected, result.Kind);
        Assert.IsFalse(string.IsNullOrWhiteSpace(result.UserMessage));
        Assert.IsFalse(string.IsNullOrWhiteSpace(result.RecoveryInstruction));
        Assert.IsFalse(result.UserMessage.Contains("operation.sqlite3", StringComparison.OrdinalIgnoreCase));
    }
}
