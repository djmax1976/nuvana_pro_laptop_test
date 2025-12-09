-- Quick fix: Assign auto-generated game codes to all games without codes
-- This is for test/development environment only

DO $$
DECLARE
    game_rec RECORD;
    next_code INTEGER := 1000;
BEGIN
    FOR game_rec IN
        SELECT game_id FROM lottery_games WHERE game_code IS NULL ORDER BY created_at
    LOOP
        -- Generate unique 4-digit code
        WHILE EXISTS (SELECT 1 FROM lottery_games WHERE game_code = LPAD(next_code::TEXT, 4, '0')) LOOP
            next_code := next_code + 1;
        END LOOP;

        -- Update the game with the new code
        UPDATE lottery_games
        SET game_code = LPAD(next_code::TEXT, 4, '0')
        WHERE game_id = game_rec.game_id;

        next_code := next_code + 1;
    END LOOP;

    RAISE NOTICE 'Successfully assigned game codes to all games';
END $$;

-- Verify all games now have game codes
SELECT
    COUNT(*) as total_games,
    COUNT(game_code) as games_with_codes,
    COUNT(*) FILTER (WHERE game_code IS NULL) as games_without_codes
FROM lottery_games;
