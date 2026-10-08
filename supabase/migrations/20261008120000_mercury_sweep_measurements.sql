alter table app.mercury_movements
  drop constraint mercury_movements_kind_check,
  drop constraint mercury_movements_sweep_check;

alter table app.mercury_movements
  add constraint mercury_movements_kind_check check (
    movement_kind in (
      'INITIAL_LOAD', 'RELOAD', 'RECOVERY', 'SWEEP_INPUT', 'SWEEP_REMAINDER'
    )
  ),
  add constraint mercury_movements_sweep_check check (
    (movement_kind in ('RECOVERY', 'SWEEP_INPUT', 'SWEEP_REMAINDER') and sweep_id is not null)
    or (movement_kind in ('INITIAL_LOAD', 'RELOAD') and sweep_id is null)
  );

comment on column app.mercury_movements.movement_kind is
  'SWEEP_INPUT and SWEEP_REMAINDER are the current per-sweep mercury measurements. '
  'INITIAL_LOAD, RELOAD and RECOVERY remain accepted only to preserve historical records.';
