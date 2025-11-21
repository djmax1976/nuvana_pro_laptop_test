-- Add validation for RLS context user ID to prevent SQL injection
-- This function validates UUID format before setting the session variable

CREATE OR REPLACE FUNCTION app.set_current_user_id(user_id_param TEXT)
RETURNS VOID AS $$
BEGIN
  -- Validate that user_id_param is a valid UUID
  -- The ::UUID cast will throw an error if invalid
  IF user_id_param IS NOT NULL THEN
    PERFORM user_id_param::UUID;
  END IF;
  
  -- If valid, set the session variable
  EXECUTE format('SET LOCAL app.current_user_id = %L', user_id_param);
END;
$$ LANGUAGE plpgsql;
