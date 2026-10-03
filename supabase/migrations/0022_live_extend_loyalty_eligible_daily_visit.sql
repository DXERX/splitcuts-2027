-- =============================================================================
-- Split Rewards eligibility
--
-- A customer can earn at most ONE loyalty visit per appointment_date.
--
-- Eligible services:
--   Hair
--   Hair + Beard
--
-- Beard-only and every other service do NOT earn loyalty visits.
-- =============================================================================

create or replace function public.evaluate_loyalty_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_program public.loyalty_programs;
  v_progress integer;
begin
  -- Only process the first transition into completed.
  if new.status <> 'completed'
     or old.status = 'completed'
     or new.customer_id is null then
    return new;
  end if;

  -- Split Rewards is earned only from:
  -- Hair
  -- Hair + Beard
  if new.service_id not in (
    '547b4ca9-060a-4720-9023-468937b96184'::uuid,
    '4ec810f7-2f32-4210-87dd-705584d80f62'::uuid
  ) then
    return new;
  end if;

  for v_program in
    select *
    from public.loyalty_programs
    where is_active = true
      and (
        branch_id is null
        or branch_id = new.branch_id
      )
  loop

    -- Maximum ONE earned visit per customer, per program,
    -- per appointment date.
    --
    -- We join back to appointments instead of using created_at,
    -- because the business rule is based on the appointment day,
    -- not the timestamp when staff pressed DONE.
    if exists (
      select 1
      from public.loyalty_transactions lt
      join public.appointments a
        on a.id = lt.appointment_id
      where lt.customer_id = new.customer_id
        and lt.loyalty_program_id = v_program.id
        and lt.type = 'visit_earned'
        and a.appointment_date = new.appointment_date
    ) then
      continue;
    end if;

    insert into public.loyalty_transactions (
      customer_id,
      loyalty_program_id,
      appointment_id,
      type,
      amount,
      reason
    )
    values (
      new.customer_id,
      v_program.id,
      new.id,
      'visit_earned',
      1,
      'Completed eligible Split Rewards visit'
    );

    select
      coalesce(sum(lt.amount) filter (
        where lt.type = 'visit_earned'
      ), 0)
      -
      coalesce(sum(lt.amount) filter (
        where lt.type = 'visit_removed'
      ), 0)
    into v_progress
    from public.loyalty_transactions lt
    where lt.customer_id = new.customer_id
      and lt.loyalty_program_id = v_program.id;

    if v_progress > 0
       and v_progress % v_program.visits_required = 0 then

      insert into public.rewards (
        customer_id,
        loyalty_program_id,
        branch_id,
        reward_type,
        status,
        metadata
      )
      values (
        new.customer_id,
        v_program.id,
        new.branch_id,
        v_program.reward_type,
        'available',
        jsonb_build_object(
          'triggered_by_appointment_id',
          new.id
        )
      );

      insert into public.loyalty_transactions (
        customer_id,
        loyalty_program_id,
        appointment_id,
        type,
        amount,
        reason
      )
      values (
        new.customer_id,
        v_program.id,
        new.id,
        'reward_earned',
        0,
        'Free cut unlocked'
      );

      insert into public.staff_notifications (
        branch_id,
        appointment_id,
        type,
        payload
      )
      values (
        new.branch_id,
        new.id,
        'reward_earned',
        jsonb_build_object(
          'customer_id',
          new.customer_id,
          'loyalty_program_id',
          v_program.id
        )
      );

    end if;
  end loop;

  return new;
end;
$$;