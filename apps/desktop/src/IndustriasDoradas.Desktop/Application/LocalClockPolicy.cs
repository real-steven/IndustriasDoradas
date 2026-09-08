namespace IndustriasDoradas.Desktop.Application;

public static class LocalClockPolicy
{
    public static TimeSpan AllowedRollback { get; } = TimeSpan.FromMinutes(5);
}

public sealed class LocalClockRollbackException()
    : InvalidOperationException(
        "El reloj del equipo está atrasado respecto de la última operación. Corrija fecha, hora y zona horaria antes de continuar.");
