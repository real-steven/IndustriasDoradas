import type { AuditEvent } from "./management-shipments-data";

export function managerAuditAction(
  event: AuditEvent,
  language: "es" | "en",
): string {
  const es = language === "es";
  const changed = event.changedFields ?? [];
  const beforeGold = event.changes?.gold_amount_grams?.before;

  if (event.action === "sync.ingest") {
    const messages: Record<string, readonly [string, string]> = {
      shipment: [
        "La planta envió información de un cargamento",
        "The plant sent shipment information",
      ],
      production_event: [
        "La planta registró actividad de producción",
        "The plant recorded production activity",
      ],
      production_sweep: [
        "La planta registró una barrida de producción",
        "The plant recorded a production sweep",
      ],
      mercury_movement: [
        "La planta registró un movimiento de mercurio",
        "The plant recorded a mercury movement",
      ],
    };
    const message = messages[event.entityType];
    return message === undefined
      ? es
        ? "La planta registró nueva información"
        : "The plant recorded new information"
      : message[es ? 0 : 1];
  }

  if (event.action === "attendance.record")
    return es
      ? "Se registró una marcación de asistencia"
      : "An attendance entry was recorded";

  if (event.action === "attendance.correct")
    return es
      ? "Se corrigió una marcación de asistencia"
      : "An attendance entry was corrected";

  if (event.action === "inventory.manage")
    return inventoryAction(event.entityType, es);

  if (event.action === "business.mutation") {
    if (
      event.entityType === "shipment" &&
      changed.includes("gold_amount_grams")
    )
      return beforeGold === null || beforeGold === undefined
        ? es
          ? "Se registró un resultado de oro"
          : "A gold result was recorded"
        : es
          ? "Se corrigió un resultado de oro"
          : "A gold result was corrected";
    return businessMutationAction(event, es);
  }

  const actions: Record<string, readonly [string, string]> = {
    "account.provision": [
      "Se creó una cuenta de usuario",
      "A user account was created",
    ],
    "account.governance": [
      "Se cambió el estado de una cuenta",
      "An account status was changed",
    ],
    "permission.governance": [
      "Se actualizaron permisos de usuario",
      "User permissions were updated",
    ],
    "privilege.elevation": [
      event.result === "SUCCEEDED"
        ? "Se autorizó el acceso protegido a una estación"
        : "Se bloqueó un intento de acceso protegido",
      event.result === "SUCCEEDED"
        ? "Protected station access was authorized"
        : "A protected access attempt was blocked",
    ],
    "authorization.policy": [
      "Se bloqueó una acción por falta de permiso",
      "An action was blocked due to missing permission",
    ],
  };
  const message = actions[event.action];
  return message === undefined
    ? es
      ? "Se registró una actividad importante"
      : "Important activity was recorded"
    : message[es ? 0 : 1];
}

export function managerAuditArea(
  entityType: string,
  language: "es" | "en",
): string {
  const es = language === "es";
  if (entityType.includes("worker") || entityType.includes("attendance"))
    return es ? "Personal" : "Personnel";
  if (entityType.includes("user_profile")) return es ? "Usuarios" : "Users";
  if (entityType.includes("shipment") || entityType.includes("production"))
    return es ? "Producción" : "Production";
  if (entityType.includes("supplier")) return es ? "Proveedores" : "Suppliers";
  if (entityType.includes("inventory")) return es ? "Inventario" : "Inventory";
  if (entityType.includes("rastra") || entityType.includes("novelty"))
    return es ? "Mantenimiento" : "Maintenance";
  if (entityType.includes("station_session") || entityType === "api_endpoint")
    return es ? "Seguridad" : "Security";
  if (
    entityType === "plant" ||
    entityType === "station" ||
    entityType.includes("line_component")
  )
    return es ? "Configuración operativa" : "Operations setup";
  return es ? "Sistema" : "System";
}

export function managerAuditResult(
  result: AuditEvent["result"],
  language: "es" | "en",
): string {
  if (result === "SUCCEEDED")
    return language === "es" ? "Completado" : "Completed";
  if (result === "REJECTED")
    return language === "es" ? "Rechazado" : "Rejected";
  return language === "es" ? "No completado" : "Not completed";
}

export function managerAuditOrigin(
  origin: AuditEvent["origin"],
  language: "es" | "en",
): string {
  const es = language === "es";
  const origins: Record<
    NonNullable<AuditEvent["origin"]>,
    readonly [string, string]
  > = {
    API: ["Servicio central", "Central service"],
    WEB: ["Portal gerencial", "Management portal"],
    DESKTOP: ["Aplicación de planta", "Plant application"],
    SYNC: ["Sincronización de planta", "Plant synchronization"],
    SYSTEM: ["Proceso automático", "Automated process"],
  };
  if (origin === undefined) return es ? "No indicado" : "Not specified";
  return origins[origin][es ? 0 : 1];
}

export function managerAuditField(
  field: string,
  language: "es" | "en",
): string {
  const labels: Record<string, readonly [string, string]> = {
    account_status: ["Estado de la cuenta", "Account status"],
    canonical_worker_id: ["Trabajador unificado", "Merged worker"],
    change_type: ["Tipo de cambio", "Change type"],
    code: ["Código", "Code"],
    decimal_places: ["Decimales permitidos", "Allowed decimals"],
    description: ["Descripción", "Description"],
    device_identifier_changed: [
      "Identificador de la estación",
      "Station identifier",
    ],
    display_order: ["Orden de visualización", "Display order"],
    email: ["Correo electrónico", "Email"],
    gold_amount_grams: ["Oro total (gramos)", "Total gold (grams)"],
    is_active: ["Estado activo", "Active status"],
    is_custom: ["Registro personalizado", "Custom record"],
    line_count: ["Cantidad de líneas", "Line count"],
    movement_type: ["Tipo de movimiento", "Movement type"],
    name: ["Nombre", "Name"],
    permission_count: ["Cantidad de permisos", "Permission count"],
    phone: ["Teléfono", "Phone"],
    provisioning_method: ["Método de creación", "Creation method"],
    quantity: ["Cantidad", "Quantity"],
    quantity_delta: ["Variación de existencia", "Stock change"],
    reason: ["Motivo", "Reason"],
    request_status: ["Estado de la solicitud", "Request status"],
    role_code: ["Rol", "Role"],
    station_count: ["Cantidad de estaciones", "Station count"],
    status: ["Estado", "Status"],
    status_reason: ["Motivo del estado", "Status reason"],
    timezone: ["Zona horaria", "Time zone"],
    worker_status: ["Estado del trabajador", "Worker status"],
  };
  const label = labels[field];
  if (label !== undefined) return label[language === "es" ? 0 : 1];
  const words = field.replaceAll("_", " ").trim();
  return words.length === 0
    ? language === "es"
      ? "Dato"
      : "Field"
    : `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

export function managerVisibleAuditChanges(
  event: AuditEvent,
): [string, { before: unknown; after: unknown }][] {
  const hidden = new Set([
    "device_identifier_changed",
    "occurred_at_utc",
    "provisioning_method",
  ]);
  return Object.entries(event.changes ?? {}).filter(
    ([field]) => !field.endsWith("_id") && !hidden.has(field),
  );
}

export function managerAuditReason(
  reasonCode: string,
  language: "es" | "en",
): string {
  if (reasonCode === "AUTHENTICATION_REQUIRED")
    return language === "es"
      ? "La sesión no pudo ser validada."
      : "The session could not be validated.";
  if (reasonCode.includes("REJECTED"))
    return language === "es"
      ? "La operación fue rechazada por una regla o validación."
      : "The operation was rejected by a rule or validation.";
  return language === "es"
    ? "No fue posible completar la operación."
    : "The operation could not be completed.";
}

function businessMutationAction(event: AuditEvent, es: boolean): string {
  const created = isCreation(event);
  const active = event.changes?.is_active?.after;
  const requestStatus = event.changes?.request_status?.after;
  const movement = event.changes?.movement_type?.after;
  const changeType = event.changes?.change_type?.after;

  if (event.entityType === "worker_request") {
    if (requestStatus === "APPROVED")
      return es
        ? "Se aprobó una solicitud de trabajador"
        : "A worker request was approved";
    if (requestStatus === "REJECTED")
      return es
        ? "Se rechazó una solicitud de trabajador"
        : "A worker request was rejected";
    if (requestStatus === "MERGED")
      return es
        ? "Se unificó una solicitud con otro trabajador"
        : "A worker request was merged with another worker";
  }

  if (event.entityType === "inventory_movement")
    return inventoryMovementAction(movement, es);
  if (event.entityType === "inventory_review")
    return es
      ? "Se registró una revisión de inventario"
      : "An inventory review was recorded";
  if (event.entityType === "rastra_component_change")
    return componentChangeAction(changeType, es);
  if (event.entityType === "operational_novelty_change")
    return changeType === "CLOSURE"
      ? es
        ? "Se cerró una novedad de mantenimiento"
        : "A maintenance issue was closed"
      : es
        ? "Se abrió una novedad de mantenimiento"
        : "A maintenance issue was opened";

  const messages: Record<
    string,
    {
      created: readonly [string, string];
      updated: readonly [string, string];
      enabled: readonly [string, string];
      disabled: readonly [string, string];
    }
  > = {
    worker: {
      created: [
        "Se solicitó agregar un trabajador",
        "A request to add a worker was submitted",
      ],
      updated: ["Se actualizó un trabajador", "A worker was updated"],
      enabled: ["Se reactivó un trabajador", "A worker was reactivated"],
      disabled: ["Se desactivó un trabajador", "A worker was deactivated"],
    },
    supplier: entityMessages("un proveedor", "a supplier"),
    production_line: entityMessages(
      "una línea de producción",
      "a production line",
    ),
    line_component: entityMessages(
      "un componente de producción",
      "a production component",
    ),
    station: entityMessages("una estación", "a station"),
    plant: entityMessages("una planta", "a plant"),
    inventory_item_type: entityMessages("un tipo de artículo", "an item type"),
    inventory_unit: entityMessages(
      "una unidad de inventario",
      "an inventory unit",
    ),
    inventory_item: entityMessages(
      "un artículo de inventario",
      "an inventory item",
    ),
    shipment: entityMessages("un cargamento", "a shipment"),
  };
  const message = messages[event.entityType];
  if (message === undefined)
    return es
      ? "Se guardó un cambio administrativo"
      : "An administrative change was saved";
  if (active === false) return message.disabled[es ? 0 : 1];
  if (active === true && event.changes?.is_active?.before === false)
    return message.enabled[es ? 0 : 1];
  return (created ? message.created : message.updated)[es ? 0 : 1];
}

function entityMessages(spanish: string, english: string) {
  return {
    created: [
      `Se agregó ${spanish}`,
      `${capitalize(english)} was added`,
    ] as const,
    updated: [
      `Se actualizó ${spanish}`,
      `${capitalize(english)} was updated`,
    ] as const,
    enabled: [
      `Se reactivó ${spanish}`,
      `${capitalize(english)} was reactivated`,
    ] as const,
    disabled: [
      `Se desactivó ${spanish}`,
      `${capitalize(english)} was deactivated`,
    ] as const,
  };
}

function inventoryAction(entityType: string, es: boolean): string {
  const messages: Record<string, readonly [string, string]> = {
    inventory_movement: [
      "La planta registró un movimiento de inventario",
      "The plant recorded an inventory movement",
    ],
    inventory_review: [
      "La planta registró una revisión de inventario",
      "The plant recorded an inventory review",
    ],
    rastra_component_change: [
      "La planta registró un cambio de componente",
      "The plant recorded a component change",
    ],
    operational_novelty_change: [
      "La planta registró una novedad de mantenimiento",
      "The plant recorded a maintenance issue",
    ],
  };
  return (messages[entityType] ?? [
    "La planta registró actividad de inventario",
    "The plant recorded inventory activity",
  ])[es ? 0 : 1];
}

function inventoryMovementAction(value: unknown, es: boolean): string {
  const messages: Record<string, readonly [string, string]> = {
    ENTRY: ["Se registró una entrada de inventario", "Inventory was received"],
    EXIT: ["Se registró una salida de inventario", "Inventory was issued"],
    CONSUMPTION: [
      "Se registró consumo de inventario",
      "Inventory use was recorded",
    ],
    RETURN: [
      "Se registró una devolución al inventario",
      "An inventory return was recorded",
    ],
    ADJUSTMENT: [
      "Se ajustó la existencia de inventario",
      "Inventory stock was adjusted",
    ],
    REVERSAL: [
      "Se anuló un movimiento de inventario",
      "An inventory movement was reversed",
    ],
  };
  return (
    (typeof value === "string" ? messages[value] : undefined)?.[es ? 0 : 1] ??
    (es
      ? "Se registró un movimiento de inventario"
      : "An inventory movement was recorded")
  );
}

function componentChangeAction(value: unknown, es: boolean): string {
  const messages: Record<string, readonly [string, string]> = {
    INSTALLATION: ["Se instaló un componente", "A component was installed"],
    REMOVAL: ["Se retiró un componente", "A component was removed"],
    REPLACEMENT: ["Se reemplazó un componente", "A component was replaced"],
  };
  return (
    (typeof value === "string" ? messages[value] : undefined)?.[es ? 0 : 1] ??
    (es
      ? "Se registró un cambio de componente"
      : "A component change was recorded")
  );
}

function isCreation(event: AuditEvent): boolean {
  const changes = Object.values(event.changes ?? {});
  return (
    changes.length > 0 && changes.every((change) => change.before === null)
  );
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}
