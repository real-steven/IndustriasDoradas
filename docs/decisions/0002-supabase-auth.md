# ADR-0002: Supabase Auth para identidad

- **Estado:** Aceptada
- **Fecha:** 2026-08-14

## Contexto

Web y desktop necesitan sesiones, recuperación de acceso y futura MFA. Los roles
funcionales y las cuentas privilegiadas separadas pertenecen al sistema, no al
proveedor de identidad.

## Decisión

Supabase Auth emite la identidad y sus JWT. NestJS valida firma, emisor,
audiencia y vigencia, y después resuelve cuenta, organización, rol y permisos
propios. MFA y dispositivos administrativos autorizados son obligatorios antes
de producción.

## Alternativas descartadas

- **Autenticación casera:** aumenta riesgo en contraseñas, sesiones y recuperación.
- **Roles solo en metadatos del JWT:** dificulta revocación y convierte datos del
  proveedor en autoridad de permisos de negocio.
- **Cuenta compartida por persona con todos sus roles:** hace más probable una
  modificación accidental desde un perfil gerencial.

## Consecuencias

- Se delega el ciclo de identidad, no la autorización de negocio.
- La API depende de disponibilidad y contratos de Supabase Auth para sesiones
  nuevas; desktop podrá admitir únicamente sesiones offline previamente válidas.
- Toda cuenta privilegiada requiere trazabilidad y revocación propia.

