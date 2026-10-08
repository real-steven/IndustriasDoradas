INSERT INTO cached_line_components(
    id, organization_id, line_id, component_type_code, code, name,
    display_order, is_active, updated_at_utc)
SELECT
    json_extract(payload_json, '$.id'),
    json_extract(payload_json, '$.organization_id'),
    json_extract(payload_json, '$.production_line_id'),
    COALESCE(
        json_extract(payload_json, '$.component_type_code'),
        CASE json_extract(payload_json, '$.code')
            WHEN 'MOLINO_1' THEN 'MOLINO'
            ELSE 'RASTRA'
        END),
    json_extract(payload_json, '$.code'),
    json_extract(payload_json, '$.name'),
    json_extract(payload_json, '$.display_order'),
    CASE WHEN json_extract(payload_json, '$.is_active') IN (1, 'true') THEN 1 ELSE 0 END,
    COALESCE(json_extract(payload_json, '$.updated_at'), changed_at_utc)
FROM sync_entity_cache
WHERE entity_type = 'LINE_COMPONENT'
  AND action <> 'DELETED'
  AND json_extract(payload_json, '$.id') IS NOT NULL
ON CONFLICT(id) DO UPDATE SET
    organization_id = excluded.organization_id,
    line_id = excluded.line_id,
    component_type_code = excluded.component_type_code,
    code = excluded.code,
    name = excluded.name,
    display_order = excluded.display_order,
    is_active = excluded.is_active,
    updated_at_utc = excluded.updated_at_utc;
