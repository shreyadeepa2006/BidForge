-- ============================================================
-- BidForge : run_all.sql   (builds the whole database from scratch)
--   sqlplus system/YOUR_PASSWORD@localhost:1521/XEPDB1
--   SQL> @run_all.sql
-- 01 drops and recreates the five tables, so this also resets everything.
-- ============================================================
@01_schema.sql
@02_procedures.sql
@03_sample_data.sql
@04_reports_and_tests.sql
PROMPT
PROMPT ===== BidForge database is ready =====
