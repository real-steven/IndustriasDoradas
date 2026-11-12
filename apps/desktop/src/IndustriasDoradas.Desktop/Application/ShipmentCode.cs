namespace IndustriasDoradas.Desktop.Application;

/// <summary>
/// Código legible del cargamento: los primeros 8 caracteres de su UUID en mayúsculas.
/// Se deriva siempre del UUID (el identificador estable que comparten SQLite, Outbox,
/// API, Supabase, web y reportes) y nunca se guarda aparte. Es el mismo código que la
/// web acepta en la búsqueda; no es una credencial.
/// </summary>
public static class ShipmentCode
{
    public static string From(Guid shipmentId) =>
        shipmentId.ToString("D")[..8].ToUpperInvariant();
}
