using IndustriasDoradas.Desktop.Application.Profile;

namespace IndustriasDoradas.Desktop.Tests.Application;

[TestClass]
public sealed class PhoneNumberTests
{
    [TestMethod]
    [DataRow("8888-7777", "+50688887777")]
    [DataRow("2222 3333", "+50622223333")]
    [DataRow("+506 6123 4567", "+50661234567")]
    [DataRow("00506 7123-4567", "+50671234567")]
    [DataRow("+1 (415) 555-0100", "+14155550100")]
    public void NormalizesCostaRicaAndInternationalNumbers(string input, string expected) =>
        Assert.AreEqual(expected, PhoneNumber.Normalize(input));

    [TestMethod]
    [DataRow("")]
    [DataRow("123")]
    [DataRow("1888-7777")]
    [DataRow("+506 1234 5678")]
    [DataRow("88+887777")]
    [DataRow("abc88887777")]
    public void RejectsInvalidNumbers(string input) => Assert.IsNull(PhoneNumber.Normalize(input));

    [TestMethod]
    public void FormatsCostaRicaNumbersForDisplay() =>
        Assert.AreEqual("+506 8888 7777", PhoneNumber.Format("+50688887777"));
}
