-- Add database trigger to maintain tickets_sold_count automatically
-- Story 6.13: Lottery Database Enhancements & Bin Management
-- Task 10: Implement denormalized ticket count maintenance

-- Step 1: Create function to update ticket count when a ticket is sold
CREATE OR REPLACE FUNCTION update_ticket_count_on_sale()
RETURNS TRIGGER AS $$
BEGIN
  -- Only update if sold_at is set (ticket was actually sold)
  IF NEW.sold_at IS NOT NULL THEN
    -- Update the pack's tickets_sold_count and last_sold_at
    UPDATE lottery_packs
    SET 
      tickets_sold_count = tickets_sold_count + 1,
      last_sold_at = NEW.sold_at
    WHERE pack_id = NEW.pack_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Create trigger that fires after INSERT on lottery_ticket_serials
CREATE TRIGGER lottery_ticket_serial_sold_trigger
  AFTER INSERT ON lottery_ticket_serials
  FOR EACH ROW
  WHEN (NEW.sold_at IS NOT NULL)
  EXECUTE FUNCTION update_ticket_count_on_sale();

-- Step 3: Create trigger that fires after UPDATE if sold_at changes from NULL to NOT NULL
CREATE TRIGGER lottery_ticket_serial_sold_update_trigger
  AFTER UPDATE ON lottery_ticket_serials
  FOR EACH ROW
  WHEN (OLD.sold_at IS NULL AND NEW.sold_at IS NOT NULL)
  EXECUTE FUNCTION update_ticket_count_on_sale();

-- Note: This trigger provides automatic maintenance of tickets_sold_count
-- Application logic in lottery-count.service.ts provides alternative approach
-- Both can coexist - trigger handles database-level updates, service handles application-level updates
