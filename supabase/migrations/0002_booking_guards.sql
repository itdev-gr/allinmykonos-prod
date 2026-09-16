-- Booking integrity: RLS says WHO can update a booking; this trigger says WHAT
-- they may change. Price/party fields are immutable, and status transitions
-- depend on the actor's relationship to the booking.

create or replace function public.enforce_booking_update()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  -- Service-role / server-side calls (no JWT user) bypass the state machine.
  if auth.uid() is null then
    return new;
  end if;

  if new.unit_price is distinct from old.unit_price
    or new.total_price is distinct from old.total_price
    or new.commission_pct is distinct from old.commission_pct
    or new.commission_amount is distinct from old.commission_amount
    or new.currency is distinct from old.currency
    or new.user_id is distinct from old.user_id
    or new.business_id is distinct from old.business_id
    or new.service_id is distinct from old.service_id
    or new.booking_ref is distinct from old.booking_ref then
    raise exception 'Booking price and party fields are immutable';
  end if;

  if public.is_admin() then
    return new;
  end if;

  if public.owns_business(new.business_id) then
    if new.status is distinct from old.status and not (
      (old.status = 'pending' and new.status in ('confirmed', 'rejected'))
      or (old.status = 'confirmed' and new.status in ('completed', 'no_show', 'cancelled'))
    ) then
      raise exception 'Invalid status transition for business: % -> %', old.status, new.status;
    end if;
    return new;
  end if;

  -- Customer: may only cancel an open booking (and edit their own notes).
  if new.status is distinct from old.status
    and not (old.status in ('pending', 'confirmed') and new.status = 'cancelled') then
    raise exception 'Customers may only cancel a booking';
  end if;
  if new.business_notes is distinct from old.business_notes then
    raise exception 'Only the business may edit business notes';
  end if;

  return new;
end;
$$;

create trigger bookings_enforce_update
  before update on public.bookings
  for each row execute function public.enforce_booking_update();
