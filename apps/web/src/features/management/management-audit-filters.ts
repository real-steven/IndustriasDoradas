/**
 * Filtros de Auditoría que dependen del área elegida. Todo se guarda en la URL
 * (`view`, `filter`, `value`) y se traduce a parámetros del servidor: la web
 * nunca descarga el historial completo para filtrarlo.
 */

export type AuditGroupKey =
  "operation" | "people" | "security" | "administration";
export type AuditViewKey = "all" | "shipments" | AuditGroupKey;

/** Origen de los valores del segundo selector. */
export type AuditFilterSource = "fixed" | "line" | "supplier" | "person";

export interface AuditFilterValue {
  value: string;
  spanish: string;
  english: string;
  /** Tipos de acción de la vista gerencial (`audit_kind`). */
  kinds?: readonly string[];
}

export interface AuditFilterDefinition {
  key: string;
  spanish: string;
  english: string;
  source: AuditFilterSource;
  /** Valores fijos; las líneas, proveedores y personas vienen del catálogo. */
  values?: readonly AuditFilterValue[];
}

type FixedValue = AuditFilterValue;

const value = (
  key: string,
  spanish: string,
  english: string,
  kinds?: readonly string[],
): FixedValue => ({
  value: key,
  spanish,
  english,
  ...(kinds ? { kinds } : {}),
});

const operationKinds: readonly FixedValue[] = [
  value(
    "line_started",
    "Línea preparada o iniciada",
    "Line prepared or started",
    ["LINE_STARTED"],
  ),
  value("shipment_completed", "Cargamento finalizado", "Shipment completed", [
    "SHIPMENT_COMPLETED",
  ]),
  value("sweep", "Barrida registrada", "Sweep recorded", [
    "SWEEP_RECORDED",
    "MERCURY_RECORDED",
  ]),
  value("responsible", "Cambio de responsable", "Responsible changed", [
    "RESPONSIBLE_CHANGED",
  ]),
  value("correction", "Corrección relevante", "Relevant correction", [
    "CAJUELA_REVERSED",
  ]),
];

const peopleKinds: readonly FixedValue[] = [
  value("check_in", "Entrada", "Check-in", ["ATTENDANCE_CHECK_IN"]),
  value("check_out", "Salida", "Check-out", ["ATTENDANCE_CHECK_OUT"]),
  value("check_in_corrected", "Corrección de entrada", "Check-in correction", [
    "ATTENDANCE_CHECK_IN_CORRECTED",
  ]),
  value("check_out_corrected", "Corrección de salida", "Check-out correction", [
    "ATTENDANCE_CHECK_OUT_CORRECTED",
  ]),
  value("user_created", "Creación de usuario", "User created", [
    "USER_CREATED",
  ]),
  value("account_changed", "Suspensión o edición", "Suspension or edit", [
    "USER_SUSPENDED",
    "USER_REACTIVATED",
    "USER_UPDATED",
    "WORKER_UPDATED",
  ]),
];

const securityKinds: readonly FixedValue[] = [
  value("session", "Inicio de sesión", "Sign-in", ["SESSION_SIGNED_IN"]),
  value(
    "station",
    "Apertura o cierre de estación",
    "Station opened or closed",
    ["STATION_OPENED", "STATION_CLOSED"],
  ),
  value("pin", "Elevación con PIN", "PIN elevation", ["ELEVATION_PIN"]),
  value("biometric", "Elevación biométrica", "Biometric elevation", [
    "ELEVATION_BIOMETRIC",
  ]),
  value("rejected", "Rechazo o expiración", "Rejection or expiry", [
    "SECURITY_REJECTED",
    "SESSION_EXPIRED",
    "ELEVATION_ENDED",
    "PERMISSION_BLOCKED",
  ]),
];

const administrationKinds: readonly FixedValue[] = [
  value("gold", "Resultado de oro", "Gold result", ["GOLD_RESULT"]),
  value("supplier", "Proveedores", "Suppliers", ["SUPPLIER_CHANGED"]),
  value("lines", "Líneas y componentes", "Lines and components", [
    "LINE_CONFIGURATION",
  ]),
  value("plant", "Planta y estaciones", "Plant and stations", [
    "PLANT_CONFIGURATION",
  ]),
  value("permissions", "Permisos de usuario", "User permissions", [
    "PERMISSIONS_UPDATED",
  ]),
  value("payroll", "Prenómina", "Payroll", ["PAYROLL_CHANGED"]),
  value("settlement", "Liquidaciones", "Settlements", ["SETTLEMENT_CHANGED"]),
  value(
    "other",
    "Otros cambios administrativos",
    "Other administrative changes",
    ["ADMIN_CHANGE"],
  ),
];

const shipmentDateValues: readonly FixedValue[] = [
  value("recent", "Más recientes primero", "Most recent first"),
  value("oldest", "Más antiguos primero", "Oldest first"),
];

const shipmentCajuelaValues: readonly FixedValue[] = [
  value("cajuelas_desc", "Mayor a menor", "Most to fewest"),
  value("cajuelas_asc", "Menor a mayor", "Fewest to most"),
];

const shipmentGoldValues: readonly FixedValue[] = [
  value("recorded", "Con oro registrado", "Gold recorded"),
  value("pending", "Sin oro registrado", "Gold not recorded"),
];

const actionFilter = (
  values: readonly FixedValue[],
): AuditFilterDefinition => ({
  key: "action",
  spanish: "Acción",
  english: "Action",
  source: "fixed",
  values,
});

const lineFilter: AuditFilterDefinition = {
  key: "line",
  spanish: "Línea",
  english: "Line",
  source: "line",
};

const filtersByView: Record<AuditViewKey, readonly AuditFilterDefinition[]> = {
  all: [],
  shipments: [
    {
      key: "date",
      spanish: "Fecha",
      english: "Date",
      source: "fixed",
      values: shipmentDateValues,
    },
    lineFilter,
    {
      key: "supplier",
      spanish: "Proveedor",
      english: "Supplier",
      source: "supplier",
    },
    {
      key: "cajuelas",
      spanish: "Cajuelas",
      english: "Cajuelas",
      source: "fixed",
      values: shipmentCajuelaValues,
    },
    {
      key: "gold",
      spanish: "Estado del oro",
      english: "Gold status",
      source: "fixed",
      values: shipmentGoldValues,
    },
  ],
  operation: [actionFilter(operationKinds), lineFilter],
  people: [
    {
      key: "person",
      spanish: "Persona",
      english: "Person",
      source: "person",
    },
    actionFilter(peopleKinds),
  ],
  security: [actionFilter(securityKinds)],
  administration: [actionFilter(administrationKinds)],
};

export function auditFilterDefinitions(
  view: AuditViewKey,
): readonly AuditFilterDefinition[] {
  return filtersByView[view];
}

export interface SelectedAuditFilter {
  definition?: AuditFilterDefinition;
  /** Valor elegido, solo si es válido para el filtro (o un UUID de catálogo). */
  value?: string;
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** Lee `filter` y `value` de la URL y descarta combinaciones que no aplican al área. */
export function selectedAuditFilter(
  view: AuditViewKey,
  params: URLSearchParams,
): SelectedAuditFilter {
  const definition = filtersByView[view].find(
    (candidate) => candidate.key === params.get("filter"),
  );
  if (definition === undefined) return {};
  const requested = params.get("value")?.trim() ?? "";
  const valid =
    definition.source === "fixed"
      ? definition.values?.some((option) => option.value === requested) === true
      : uuidPattern.test(requested);
  return valid ? { definition, value: requested } : { definition };
}

export interface AuditActivityServerFilters {
  kinds?: string;
  workerId?: string;
  productionLineId?: string;
}

/** Parámetros del servidor para Operación, Personal, Seguridad o Administración. */
export function auditActivityServerFilters(
  selected: SelectedAuditFilter,
): AuditActivityServerFilters {
  const { definition, value: selectedValue } = selected;
  if (definition === undefined || selectedValue === undefined) return {};
  if (definition.source === "line") return { productionLineId: selectedValue };
  if (definition.source === "person") return { workerId: selectedValue };
  const option = definition.values?.find(
    (candidate) => candidate.value === selectedValue,
  );
  return option?.kinds === undefined ? {} : { kinds: option.kinds.join(",") };
}

export type ShipmentSort =
  "recent" | "oldest" | "cajuelas_desc" | "cajuelas_asc";

export interface ShipmentServerFilters {
  sort?: ShipmentSort;
  productionLineId?: string;
  supplierId?: string;
  goldResult?: "recorded" | "pending";
}

/** Parámetros del servidor para Cargamentos finalizados. */
export function shipmentServerFilters(
  selected: SelectedAuditFilter,
): ShipmentServerFilters {
  const { definition, value: selectedValue } = selected;
  if (definition === undefined || selectedValue === undefined) return {};
  switch (definition.key) {
    case "date":
    case "cajuelas":
      return { sort: selectedValue as ShipmentSort };
    case "line":
      return { productionLineId: selectedValue };
    case "supplier":
      return { supplierId: selectedValue };
    case "gold":
      return { goldResult: selectedValue as "recorded" | "pending" };
    default:
      return {};
  }
}
