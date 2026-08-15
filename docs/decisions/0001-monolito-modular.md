# ADR-0001: Monolito modular

- **Estado:** Aceptada
- **Fecha:** 2026-08-14

## Contexto

El equipo es pequeño, el dominio todavía se está validando y producción,
barridas, asistencia e inventario comparten identidad, auditoría y transacciones.

## Decisión

NestJS se despliega como un único proceso organizado por módulos de negocio. Un
módulo expone contratos explícitos y no accede a las tablas internas de otro.

## Alternativas descartadas

- **Microservicios:** multiplican despliegues, observabilidad y consistencia
  distribuida antes de existir una necesidad medida.
- **Proyecto sin módulos:** facilita dependencias circulares y mezcla reglas con
  controladores o infraestructura.
- **CQRS completo:** complejidad injustificada para la escala inicial.

## Consecuencias

- Despliegue, pruebas y transacciones son simples.
- Las fronteras deben vigilarse mediante revisión y pruebas; no las impone la red.
- Un fallo del proceso puede afectar toda la API.
- Un módulo solo se separará si carga, seguridad o autonomía lo justifican con
  evidencia.

